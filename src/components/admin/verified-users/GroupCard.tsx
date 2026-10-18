"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, Pill, linkClass } from "@/components/admin/finance/ui";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { UserGroupRow } from "@/lib/user-groups";
import UserIdentity from "./UserIdentity";

// One payer group (C52): who paid, for whom, and the admin-only note. Every
// string an admin typed (name, note, people's names) wraps anywhere, so a
// 120-letter name never widens the grid track and the page.

const VISIBLE_MEMBERS = 5;
const NOTE_PREVIEW_CHARS = 140;
const NOTE_PREVIEW_LINES = 3;

function clientHref(id: string) {
  return `/dashboard/admin/clients/${id}`;
}

function GroupNote({ note }: { note: string }) {
  const t = useTranslations("AdminVerifiedUsers");
  const lines = note.split("\n");
  const long =
    Array.from(note).length > NOTE_PREVIEW_CHARS ||
    lines.length > NOTE_PREVIEW_LINES;
  const textClass =
    "whitespace-pre-line text-[13px] leading-5 text-[#334155] [overflow-wrap:anywhere]";

  return (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-[#64748B]">
        {t("card.note")}
      </p>
      {long ? (
        // Native <details>: no measuring to decide whether it is clamped, and
        // the summary stays in place, so focus never falls out.
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] [&::-webkit-details-marker]:hidden">
            <span className={`${textClass} min-w-0 flex-1 group-open:hidden`}>
              {Array.from(lines.slice(0, NOTE_PREVIEW_LINES).join("\n"))
                .slice(0, NOTE_PREVIEW_CHARS)
                .join("")}
              …
            </span>
            <span className="shrink-0 text-[12px] font-bold leading-5 text-[#2563EB] group-open:hidden">
              {t("card.showMore")}
            </span>
            <span className="hidden shrink-0 text-[12px] font-bold leading-5 text-[#2563EB] group-open:inline">
              {t("card.showLess")}
            </span>
          </summary>
          <p className={`${textClass} pb-1`}>{note}</p>
        </details>
      ) : (
        <p className={textClass}>{note}</p>
      )}
    </div>
  );
}

export default function GroupCard({
  group,
  onEdit,
  onDelete,
}: {
  group: UserGroupRow;
  onEdit: (group: UserGroupRow) => void;
  onDelete: (group: UserGroupRow) => void;
}) {
  const t = useTranslations("AdminVerifiedUsers");
  const tShared = useTranslations("DashboardShared");
  const { payer } = group;
  const visible = group.members.slice(0, VISIBLE_MEMBERS);
  const rest = group.members.slice(VISIBLE_MEMBERS);

  return (
    <article
      data-testid="user-group-card"
      className="min-w-0 space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        {/* flex-auto: a short name sits beside the buttons, a long one takes
            the whole line and the buttons wrap under it. */}
        <h2 className="min-w-0 flex-auto pt-2 text-[16px] font-bold leading-6 text-[#0F172A] [overflow-wrap:anywhere]">
          {group.name}
        </h2>
        {/* Never disabled: the group name is in the label. Text from sm up. */}
        <div className="ml-auto flex shrink-0 gap-2">
          <Button
            icon={<Pencil className="size-4" aria-hidden />}
            aria-label={t("card.editAria", { name: group.name })}
            data-jev-label={tShared("edit")}
            onClick={() => onEdit(group)}
            className="size-11 px-0 sm:size-auto sm:px-4"
          >
            <span className="hidden sm:inline">{tShared("edit")}</span>
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" aria-hidden />}
            aria-label={t("card.deleteAria", { name: group.name })}
            data-jev-label={tShared("delete")}
            onClick={() => onDelete(group)}
            className="size-11 px-0 sm:size-auto sm:px-4"
          >
            <span className="hidden sm:inline">{tShared("delete")}</span>
          </Button>
        </div>
      </header>

      <div>
        <p className="mb-1 text-[12px] font-semibold text-[#64748B]">
          {t("card.payer")}
        </p>
        {payer ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <UserIdentity
              user={payer}
              href={clientHref(payer.id)}
              className="min-w-0 flex-[1_1_14rem]"
            />
            <div className="flex flex-wrap items-center gap-x-3">
              <Pill tone={payer.is_verified ? "success" : "neutral"}>
                {payer.is_verified
                  ? t("pills.verified")
                  : t("pills.unverified")}
              </Pill>
              <Link
                href={`/dashboard/admin/finances/revenue?payer=${payer.id}`}
                className={cn(linkClass, "text-[13px]")}
              >
                {t("card.financeLink")}
              </Link>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-[#F8FAFC] px-3 py-3 text-[13px] text-[#64748B]">
            {t("deletedAccount")}
          </p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[12px] font-semibold text-[#64748B]">
          {t("card.members", { count: group.members.length })}
        </p>
        <ul>
          {visible.map((member) => (
            <li key={member.id}>
              <UserIdentity
                user={member}
                verified={member.is_verified}
                href={clientHref(member.id)}
                compact
              />
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded text-[12px] font-bold text-[#2563EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] [&::-webkit-details-marker]:hidden">
              {t("card.moreMembers", { count: rest.length })}
            </summary>
            <ul className="max-h-80 overflow-y-auto overscroll-contain">
              {rest.map((member) => (
                <li key={member.id}>
                  <UserIdentity
                    user={member}
                    verified={member.is_verified}
                    href={clientHref(member.id)}
                    compact
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {group.note && <GroupNote note={group.note} />}
    </article>
  );
}
