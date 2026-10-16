"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck } from "lucide-react";
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
  StatusPager,
  TableToolbar,
  useDayFormat,
  useStatusList,
  useStatusQuery,
} from "@/components/admin/statuses/shared";
import { cn } from "@/lib/utils";
import {
  VERIFIED_USERS_PAGE_SIZE,
  type UserGroupMembership,
  type VerifiedUserRow,
  type VerifiedUsersPayload,
} from "@/lib/user-groups";
import {
  VERIFIED_USERS_URL,
  setVerified,
  useVerifiedUsersErrorText,
} from "./api";
import ConfirmDialog from "./ConfirmDialog";
import UserIdentity from "./UserIdentity";
import VerifyUserDialog from "./VerifyUserDialog";

// Verified accounts (C52): profiles.is_verified = true, newest verification
// first. One stacked row per account at every width; from xl the same rows
// line up as columns (the dashboard's content box is only 679 px wide at
// 1024 px, too narrow for four columns).

const GRID =
  "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.8fr)_minmax(9.5rem,0.9fr)_minmax(0,1.5fr)_12rem] xl:items-center xl:gap-6";
const VISIBLE_CHIPS = 3;

function GroupChip({
  group,
  onOpen,
}: {
  group: UserGroupMembership;
  onOpen: (groupName: string) => void;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  // A group name is up to 120 characters: the button is the 44 px hit area,
  // the pill inside truncates.
  return (
    <button
      type="button"
      onClick={() => onOpen(group.group_name)}
      title={group.group_name}
      data-jev-label={t("tabs.groups")}
      className="group inline-flex min-h-11 max-w-full items-center outline-none"
    >
      {/* The ring is drawn on the pill, not on the 44 px hit area around it. */}
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[12px] font-bold text-[#475569] transition-colors group-hover:bg-[#E2E8F0] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[#2563EB]">
        <span className="truncate">{group.group_name}</span>
        <span className="shrink-0 font-semibold text-[#475569]">
          · {t(`roles.${group.role}`)}
        </span>
      </span>
    </button>
  );
}

function VerifiedUserItem({
  row,
  day,
  onRemove,
  onOpenGroup,
}: {
  row: VerifiedUserRow;
  day: (instant: string | null | undefined) => string;
  onRemove: (row: VerifiedUserRow) => void;
  onOpenGroup: (groupName: string) => void;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tClient = useTranslations("AdminClientDetail");
  const visible = row.groups.slice(0, VISIBLE_CHIPS);
  const rest = row.groups.slice(VISIBLE_CHIPS);

  return (
    <li
      data-testid="verified-user-row"
      className={cn(
        GRID,
        "border-t border-[#F1F5F9] px-4 py-4 first:border-t-0 sm:px-5",
      )}
    >
      <UserIdentity
        user={row}
        verified
        href={`/dashboard/admin/clients/${row.id}`}
      />
      {/* No date was recorded for accounts verified before the column existed:
          a dash with a reason, never an invented day. Dropped on narrow rows. */}
      <p
        className={cn(
          "text-[13px] text-[#334155]",
          !row.verified_at && "hidden xl:block",
        )}
      >
        <span className="font-semibold text-[#64748B] xl:sr-only">
          {t("users.columns.verifiedAt")}:{" "}
        </span>
        {row.verified_at ? (
          <span className="whitespace-nowrap">{day(row.verified_at)}</span>
        ) : (
          <span title={t("users.verifiedAtUnknown")}>
            —<span className="sr-only">{t("users.verifiedAtUnknown")}</span>
          </span>
        )}
      </p>
      <div
        className={cn("min-w-0", row.groups.length === 0 && "hidden xl:block")}
      >
        {row.groups.length > 0 && (
          <p className="text-[12px] font-semibold text-[#64748B] xl:sr-only">
            {t("users.columns.groups")}
          </p>
        )}
        <div className="flex min-w-0 flex-wrap gap-x-1.5">
          {visible.map((group) => (
            <GroupChip
              key={group.group_id}
              group={group}
              onOpen={onOpenGroup}
            />
          ))}
        </div>
        {rest.length > 0 && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded text-[12px] font-bold text-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] [&::-webkit-details-marker]:hidden">
              {t("users.moreGroups", { count: rest.length })}
            </summary>
            <div className="flex min-w-0 flex-wrap gap-x-1.5">
              {rest.map((group) => (
                <GroupChip
                  key={group.group_id}
                  group={group}
                  onOpen={onOpenGroup}
                />
              ))}
            </div>
          </details>
        )}
      </div>
      <div>
        {/* Never disabled: the name is in the label (guard lives in the dialog). */}
        <Button
          variant="danger"
          aria-label={t("users.removeAria", { name: row.display_name })}
          data-jev-label={tClient("removeVerification")}
          onClick={() => onRemove(row)}
          className="w-full sm:w-auto xl:w-full"
        >
          {tClient("removeVerification")}
        </Button>
      </div>
    </li>
  );
}

export default function UsersTab({ onSettled }: { onSettled: () => void }) {
  const t = useTranslations("AdminVerifiedUsers");
  const tClient = useTranslations("AdminClientDetail");
  const tStatuses = useTranslations("AdminStatuses");
  const errorText = useVerifiedUsersErrorText();
  const day = useDayFormat();
  const { get, update, reset, page } = useStatusQuery();
  const q = get("q");

  const listUrl = useMemo(() => {
    const qs = new URLSearchParams({ page: String(page) });
    if (q) qs.set("q", q);
    return `${VERIFIED_USERS_URL}?${qs}`;
  }, [page, q]);
  const list = useStatusList<VerifiedUsersPayload>(listUrl);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [removing, setRemoving] = useState<VerifiedUserRow | null>(null);
  // reload() returns nothing: a flag says "tell the page once it has loaded".
  const settleAfterLoad = useRef(false);

  const data = list.data;
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const lastPage = Math.max(
    1,
    Math.ceil(count / (data?.pageSize ?? VERIFIED_USERS_PAGE_SIZE)),
  );

  const onSearch = useCallback(
    (value: string) => update({ q: value || null }),
    [update],
  );

  // Removing the last row of the last page leaves an empty page: go back.
  useEffect(() => {
    if (list.loading || !data) return;
    if (data.rows.length === 0 && data.count > 0 && page > lastPage) {
      update({ page: lastPage > 1 ? String(lastPage) : null }, true);
    }
  }, [list.loading, data, page, lastPage, update]);

  // The opener of a finished removal is gone from the new list: the page
  // moves focus to the tab panel instead of letting it fall to the body.
  useEffect(() => {
    if (settleAfterLoad.current && !list.loading) {
      settleAfterLoad.current = false;
      onSettled();
    }
  }, [list.loading, onSettled]);

  async function removeVerification(): Promise<string | null> {
    if (!removing) return "server_error";
    const result = await setVerified(removing.id, false);
    if (!result.ok) return result.error.code;
    if (result.data.changed) toast.success(t("remove.done"));
    else toast.info(t("remove.alreadyDone"));
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
              placeholder={t("users.searchPlaceholder")}
              loading={list.loading}
            />
            <Button
              variant="primary"
              icon={<BadgeCheck className="size-4" aria-hidden />}
              onClick={() => setVerifyOpen(true)}
              className="w-full sm:w-auto"
            >
              {t("users.verifyAction")}
            </Button>
          </div>
        </Card>
      </div>

      {data && (
        <TableToolbar>
          <span
            role="status"
            className={cn("tabular-nums", list.loading && "opacity-60")}
          >
            {q
              ? `${t("found", { count })} · ${t("users.total", { total: data.total })}`
              : t("users.total", { total: count })}
            {list.loading ? ` · ${tStatuses("common.refreshing")}` : ""}
          </span>
        </TableToolbar>
      )}

      {list.error && (
        <ErrorBox message={errorText(list.error)} onRetry={list.reload} />
      )}
      {!data || (rows.length === 0 && count > 0) ? (
        list.error ? null : (
          <Skeletons count={4} className="h-20" />
        )
      ) : rows.length === 0 ? (
        <EmptyState>{q ? t("users.emptySearch") : t("users.empty")}</EmptyState>
      ) : (
        <div
          data-testid="verified-users-list"
          className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
        >
          <div
            aria-hidden
            className={cn(
              GRID,
              "hidden border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3 text-[12px] font-bold text-[#64748B] xl:grid",
            )}
          >
            <span>{t("users.columns.user")}</span>
            <span>{t("users.columns.verifiedAt")}</span>
            <span>{t("users.columns.groups")}</span>
            <span />
          </div>
          <ul>
            {rows.map((row) => (
              <VerifiedUserItem
                key={row.id}
                row={row}
                day={day}
                onRemove={setRemoving}
                onOpenGroup={(groupName) =>
                  reset({ tab: "groups", q: groupName })
                }
              />
            ))}
          </ul>
        </div>
      )}

      {data && (
        <StatusPager
          page={data.page}
          pageSize={data.pageSize}
          count={count}
          onPage={(next) => update({ page: String(next) }, true)}
        />
      )}

      <VerifyUserDialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onDone={list.reload}
      />
      <ConfirmDialog
        open={removing !== null}
        title={tClient("removeVerification")}
        tone="danger"
        confirmLabel={tClient("removeVerification")}
        notice={t("remove.notice")}
        target={
          removing && (
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <UserIdentity user={removing} verified />
            </div>
          )
        }
        onConfirm={removeVerification}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
