"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Button,
  Card,
  EmptyState,
  Skeletons,
} from "@/components/admin/finance/ui";
import {
  ErrorBox,
  SearchBox,
  TableToolbar,
  useStatusList,
  useStatusQuery,
} from "@/components/admin/statuses/shared";
import { cn } from "@/lib/utils";
import type { UserGroupRow, UserGroupsPayload } from "@/lib/user-groups";
import { GROUPS_URL, deleteGroup, useVerifiedUsersErrorText } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import GroupCard from "./GroupCard";
import GroupFormDialog from "./GroupFormDialog";

// Payer groups (C52): create, edit, delete. The list is small (an admin
// makes these by hand), so it is loaded whole and the search filters it here.
// The search text lives in the URL, so a chip on the verified list can link
// straight to its group.

const PHONE_LIKE = /^[\d\s+()-]+$/;

function matchesGroup(group: UserGroupRow, needle: string, digits: string) {
  const people = [group.payer, ...group.members].filter(
    (person) => person !== null,
  );
  const texts = [
    group.name,
    group.note ?? "",
    ...people.map((person) => person.display_name),
  ];
  if (texts.some((text) => text.toLowerCase().includes(needle))) return true;
  // Phones are stored +995599..., shown +995 599 ... and typed any way: digits
  // only, and not for a one- or two-digit term that would match everyone.
  // `digits` is empty unless the whole term looks like a phone number.
  return (
    digits.length >= 3 &&
    people.some((person) => person.phone?.replace(/\D/g, "").includes(digits))
  );
}

export default function GroupsTab({ onSettled }: { onSettled: () => void }) {
  const t = useTranslations("AdminVerifiedUsers");
  const tShared = useTranslations("DashboardShared");
  const errorText = useVerifiedUsersErrorText();
  const { get, update } = useStatusQuery();
  const q = get("q");

  // The list never depends on the URL: the search filters it in the browser.
  const list = useStatusList<UserGroupsPayload>(GROUPS_URL);
  const [formOpen, setFormOpen] = useState(false);
  const [formGroup, setFormGroup] = useState<UserGroupRow | null>(null);
  // A new key per opening: the form starts from its group, never from the
  // previous opening's inputs.
  const [formSession, setFormSession] = useState(0);
  const [deleting, setDeleting] = useState<UserGroupRow | null>(null);
  // reload() returns nothing: flags say "tell me once it has loaded".
  const settleAfterLoad = useRef(false);
  const [gated, setGated] = useState(false);
  const gateBase = useRef<UserGroupsPayload | null>(null);

  const groups = useMemo(() => list.data?.groups ?? [], [list.data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    // A name with a number in it («ზაფხული 2026», the chip's deep link) must
    // not turn into a phone search: every Georgian mobile contains 995.
    const digits = PHONE_LIKE.test(needle) ? needle.replace(/\D/g, "") : "";
    return groups.filter((group) => matchesGroup(group, needle, digits));
  }, [groups, q]);

  const onSearch = useCallback(
    (value: string) => update({ q: value || null }),
    [update],
  );

  // The opener of a finished deletion is gone from the new list: the page
  // moves focus to the tab panel instead of letting it fall to the body.
  useEffect(() => {
    if (settleAfterLoad.current && !list.loading) {
      settleAfterLoad.current = false;
      onSettled();
    }
  }, [list.loading, onSettled]);

  // A create that failed without an answer may still have been stored: Save
  // stays off until a fresh list (or its failure) has arrived.
  useEffect(() => {
    if (gated && (list.data !== gateBase.current || list.error)) {
      setGated(false);
    }
  }, [gated, list.data, list.error]);

  function openForm(group: UserGroupRow | null) {
    setFormGroup(group);
    setFormSession((n) => n + 1);
    setFormOpen(true);
  }

  async function removeGroup(): Promise<string | null> {
    if (!deleting) return "server_error";
    const result = await deleteGroup(deleting.id);
    if (!result.ok) {
      if (result.error.code !== "not_found") return result.error.code;
      // Deleted by someone else meanwhile: say so; the list is refreshed.
      toast.error(errorText("not_found"));
    } else {
      toast.success(t("delete.done", { name: deleting.name }));
    }
    settleAfterLoad.current = true;
    list.reload();
    return null;
  }

  return (
    <div className="space-y-4">
      <div data-jev-public>
        <Card className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchBox
              value={q}
              onCommit={onSearch}
              placeholder={t("groups.searchPlaceholder")}
              loading={list.loading}
            />
            <Button
              variant="primary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => openForm(null)}
              className="w-full sm:w-auto"
            >
              {t("groups.create")}
            </Button>
          </div>
        </Card>
      </div>

      {list.data && (
        <TableToolbar>
          <span
            role="status"
            className={cn("tabular-nums", list.loading && "opacity-60")}
          >
            {q.trim()
              ? `${t("found", { count: filtered.length })} · ${t("groups.count", { count: groups.length })}`
              : t("groups.count", { count: groups.length })}
          </span>
        </TableToolbar>
      )}

      {list.error && (
        <ErrorBox message={errorText(list.error)} onRetry={list.reload} />
      )}
      {!list.data ? (
        list.error ? null : (
          <Skeletons count={3} className="h-40" />
        )
      ) : groups.length === 0 ? (
        <EmptyState>{t("groups.empty")}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>{t("groups.emptySearch")}</EmptyState>
      ) : (
        <div
          data-testid="user-groups-grid"
          className="grid grid-cols-1 gap-4 xl:grid-cols-2"
        >
          {filtered.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onEdit={openForm}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <GroupFormDialog
        key={formSession}
        open={formOpen}
        group={formGroup}
        onClose={() => setFormOpen(false)}
        onSaved={(name, created) => {
          if (created) toast.success(t("form.created", { name }));
          else toast.success(t("form.saved", { name }));
          setFormOpen(false);
          list.reload();
        }}
        onGone={() => {
          toast.error(errorText("not_found"));
          setFormOpen(false);
          list.reload();
        }}
        onUncertain={() => {
          gateBase.current = list.data;
          setGated(true);
          list.reload();
        }}
        saveGated={gated}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t("delete.title")}
        tone="danger"
        confirmLabel={tShared("delete")}
        notice={t("delete.notice")}
        target={
          deleting && (
            <p className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[14px] font-bold text-[#0F172A] [overflow-wrap:anywhere]">
              {deleting.name}
            </p>
          )
        }
        onConfirm={removeGroup}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
