"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { Link } from "@/i18n/navigation";
import { formatPhone } from "@/lib/utils/format";
import {
  Button,
  Notice,
  Pill,
  Skeletons,
  linkClass,
  type Tone,
} from "@/components/admin/finance/ui";
import { tbilisiDateOf, type ChangeResult } from "@/lib/admin-statuses";
import ChangeForm from "./ChangeForm";
import {
  API_BASE,
  ErrorBox,
  MembershipStatePill,
  formatGel,
  useDayTimeFormat,
  useErrorText,
  useStatusList,
  type MembershipRow,
  type RenterPackage,
} from "./shared";

// Every membership period of one user (C44), with the row-level edits
// (period dates, revoke + refund) the bulk table cannot express. The change
// form opens in place of the list, so there is never a modal on a modal.

type Period = {
  id: string;
  status: string;
  starts_at: string;
  expires_at: string;
  amount_paid: number | null;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  fb_profile_url: string | null;
  package: {
    code: string;
    name: string;
    label: string | null;
    meta: { season?: string; price_tier?: string } | null;
  } | null;
  refunded: number;
  refundable: number;
};

type Detail = { user: MembershipRow; periods: Period[] };

const USER_ACTIONS = ["extend", "shorten", "set_end", "grant", "revoke"];

const PERIOD_TONES: Record<string, Tone> = {
  active: "success",
  upcoming: "info",
  pending_approval: "warning",
  expired: "neutral",
  rejected: "neutral",
  revoked: "danger",
};

type FormState =
  | { mode: "user"; action: string }
  | { mode: "period"; action: "set_period" | "revoke"; period: Period };

export default function MembershipDrawer({
  userId,
  name,
  packages,
  onClose,
  onApplied,
  onShowListings,
}: {
  userId: string | null;
  name?: string | null;
  packages: RenterPackage[];
  onClose: () => void;
  onApplied: (result: ChangeResult) => void;
  onShowListings: (userId: string) => void;
}) {
  const t = useTranslations("AdminStatuses");
  return (
    <Modal
      isOpen={userId !== null}
      onClose={onClose}
      title={name ? t("drawer.title", { name }) : t("drawer.periods")}
      size="xl"
    >
      {userId && (
        <DrawerBody
          key={userId}
          userId={userId}
          packages={packages}
          onApplied={onApplied}
          onShowListings={onShowListings}
        />
      )}
    </Modal>
  );
}

function DrawerBody({
  userId,
  packages,
  onApplied,
  onShowListings,
}: {
  userId: string;
  packages: RenterPackage[];
  onApplied: (result: ChangeResult) => void;
  onShowListings: (userId: string) => void;
}) {
  const t = useTranslations("AdminStatuses");
  const errorText = useErrorText();
  const dayTime = useDayTimeFormat();
  const detail = useStatusList<Detail>(`${API_BASE.memberships}/${userId}`);
  const [form, setForm] = useState<FormState | null>(null);
  const [now] = useState(() => Date.now());

  if (detail.error && !detail.data) {
    return (
      <ErrorBox message={errorText(detail.error)} onRetry={detail.reload} />
    );
  }
  if (!detail.data) return <Skeletons count={3} />;
  const { user, periods } = detail.data;
  const name = user.display_name || t("common.noName");

  const applied = (result: ChangeResult) => {
    detail.reload();
    onApplied(result);
  };

  if (form) {
    return (
      <ChangeForm
        kind="memberships"
        targets={
          form.mode === "period"
            ? { subscriptionId: form.period.id }
            : { userIds: [userId] }
        }
        count={1}
        label={
          form.mode === "period"
            ? `${name} · ${dayTime(form.period.starts_at)} – ${dayTime(form.period.expires_at)}`
            : name
        }
        actions={form.mode === "period" ? [form.action] : USER_ACTIONS}
        initialAction={form.action}
        packages={packages}
        period={
          form.mode === "period"
            ? {
                start: tbilisiDateOf(form.period.starts_at),
                end: tbilisiDateOf(form.period.expires_at),
                refundable: form.period.refundable,
              }
            : undefined
        }
        onApplied={applied}
        onClose={() => setForm(null)}
      />
    );
  }

  const shownStatus = (p: Period) =>
    p.status === "active" && Date.parse(p.expires_at) <= now
      ? "expired"
      : p.status === "active" && Date.parse(p.starts_at) > now
        ? "upcoming"
        : p.status;
  const isLive = (p: Period) =>
    p.status === "active" && Date.parse(p.expires_at) > now;
  const rentals = user.rental_count ?? 0;

  return (
    <div className="space-y-5" data-testid="membership-drawer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[18px] font-black text-[#0F172A]">{name}</p>
          <p className="text-[13px] text-[#64748B]">
            {user.phone ? formatPhone(user.phone) : t("common.noPhone")}
            {user.role ? ` · ${user.role}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <MembershipStatePill state={user.state} />
            <Pill tone={user.covered_now ? "success" : "neutral"}>
              {user.covered_now ? t("drawer.covered") : t("drawer.notCovered")}
            </Pill>
            <Pill tone="neutral">
              {t("drawer.rentals", {
                active: user.active_rental_count ?? 0,
                total: rentals,
              })}
            </Pill>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4">
          <Link
            href={`/dashboard/admin/clients/${userId}`}
            className={linkClass}
          >
            {t("drawer.openClient")}
          </Link>
          <button
            type="button"
            onClick={() => onShowListings(userId)}
            className={linkClass}
          >
            {t("drawer.ownerListings")}
          </button>
          {user.pending_id && (
            <Link href="/dashboard/admin/memberships" className={linkClass}>
              {t("drawer.queue")}
            </Link>
          )}
        </div>
      </div>

      {!user.covered_now && rentals > 0 && (
        <Notice tone="warning">{t("drawer.hiddenNote")}</Notice>
      )}

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-[#475569]">
          {t("drawer.userActions")}
        </p>
        <div className="flex flex-wrap gap-2">
          {USER_ACTIONS.map((action) => (
            <Button
              key={action}
              variant={action === "revoke" ? "danger" : "secondary"}
              onClick={() => setForm({ mode: "user", action })}
            >
              {t(`actions.memberships.${action}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[15px] font-bold text-[#0F172A]">
          {t("drawer.periods")}
        </h3>
        {periods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-[13px] text-[#94A3B8]">
            {t("drawer.noPeriods")}
          </p>
        ) : (
          <ul className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
            {periods.map((p) => {
              const status = shownStatus(p);
              const paid = Number(p.amount_paid ?? 0);
              return (
                <li
                  key={p.id}
                  data-testid="membership-period"
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={PERIOD_TONES[status] ?? "neutral"}>
                        {t.has(`periodStatuses.${status}`)
                          ? t(`periodStatuses.${status}`)
                          : status}
                      </Pill>
                      <span className="font-bold text-[#0F172A]">
                        {p.package?.name ?? "—"}
                      </span>
                    </div>
                    <p className="tabular-nums text-[#0F172A]">
                      {dayTime(p.starts_at)} – {dayTime(p.expires_at)}
                    </p>
                    <p className="text-[12px] text-[#64748B]">
                      {t("drawer.paid", { amount: formatGel(paid) })}
                      {p.refunded > 0 &&
                        ` · ${t("drawer.refunded", { amount: formatGel(p.refunded) })}`}
                      {` · ${t("drawer.created", { date: dayTime(p.created_at) })}`}
                    </p>
                    {p.review_note && (
                      <p className="text-[12px] italic text-[#64748B]">
                        {p.review_note}
                      </p>
                    )}
                    {p.fb_profile_url?.startsWith("https://") && (
                      <a
                        href={p.fb_profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        {t("drawer.fbProfile")}
                        <ExternalLink className="ml-1 size-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                  {isLive(p) && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          setForm({
                            mode: "period",
                            action: "set_period",
                            period: p,
                          })
                        }
                      >
                        {t("drawer.editPeriod")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() =>
                          setForm({
                            mode: "period",
                            action: "revoke",
                            period: p,
                          })
                        }
                      >
                        {t("drawer.revoke")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
