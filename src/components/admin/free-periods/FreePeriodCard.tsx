"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  FREE_PERIOD_ROLES,
  formatDay,
  type FreePeriodBenefit,
  type FreePeriodState,
  type FreePeriodView,
} from "@/lib/free-periods";

// One free period (C53): state, benefit, the two periods, who it covers and how
// many people / listings it has reached. Counters come from the same SQL
// definition the sweep uses, so "waiting" is exactly what the next run grants.

const STATE_CLASS: Record<FreePeriodState, string> = {
  running: "bg-[#ECFDF5] text-[#047857]",
  scheduled: "bg-[#EFF6FF] text-[#1D4ED8]",
  paused: "bg-[#FFFBEB] text-[#B45309]",
  ended: "bg-[#F1F5F9] text-[#475569]",
};

const BENEFIT_CLASS: Record<FreePeriodBenefit, string> = {
  membership: "bg-[#EFF6FF] text-[#1D4ED8]",
  vip: "bg-[#FEF3C7] text-[#92400E]",
  super_vip: "bg-[#F3E8FF] text-[#6B21A8]",
};

type Props = {
  period: FreePeriodView;
  busy: "toggle" | "apply" | null;
  onEdit: () => void;
  onToggle: () => void;
  onApply: () => void;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] font-bold uppercase leading-4 tracking-[0.4px] text-[#94A3B8]">
        {label}
      </dt>
      <dd className="break-words text-[13px] font-semibold leading-5 text-[#1E293B]">
        {children}
      </dd>
    </div>
  );
}

export default function FreePeriodCard({
  period,
  busy,
  onEdit,
  onToggle,
  onApply,
}: Props) {
  const t = useTranslations("AdminFreePeriods");
  const tShared = useTranslations("AdminShared");
  const ended = period.state === "ended";
  const isVip = period.benefit !== "membership";
  const roles =
    period.roles.length === FREE_PERIOD_ROLES.length
      ? t("card.allRoles")
      : period.roles.map((role) => tShared(`roles.${role}`)).join(", ");

  const actionClass =
    "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] disabled:opacity-50";

  return (
    <article
      data-testid="free-period-card"
      data-state={period.state}
      data-benefit={period.benefit}
      className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] sm:p-6"
    >
      <header className="space-y-2">
        <h3 className="break-words text-[16px] font-bold leading-6 text-[#0F172A]">
          {period.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold leading-4 ${BENEFIT_CLASS[period.benefit]}`}
          >
            {t(`benefit.${period.benefit}`)}
          </span>
          <span
            data-testid="free-period-state"
            className={`rounded-full px-3 py-1 text-[11px] font-bold leading-4 ${STATE_CLASS[period.state]}`}
          >
            {t(`states.${period.state}`)}
          </span>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Fact label={t("card.registration")}>
          {formatDay(period.registrationFrom)} –{" "}
          {formatDay(period.registrationTo)}
        </Fact>
        <Fact label={t("card.until")}>{formatDay(period.endDate)}</Fact>
        <Fact label={t("card.roles")}>{roles}</Fact>
        {isVip ? (
          <Fact label={t("card.listings")}>
            {period.maxListings
              ? t("card.listingsMax", { count: period.maxListings })
              : t("card.listingsAll")}
          </Fact>
        ) : null}
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
          <p className="text-[11px] font-bold leading-4 text-[#64748B]">
            {t("card.granted")}
          </p>
          <p
            data-testid="free-period-granted"
            className="text-[18px] font-black leading-7 text-[#0F172A]"
          >
            {isVip ? period.grantedListings : period.grantedMembers}
          </p>
          <p className="text-[11px] font-medium leading-4 text-[#64748B]">
            {isVip ? t("card.listingsUnit") : t("card.membersUnit")}
          </p>
        </div>
        <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
          <p className="text-[11px] font-bold leading-4 text-[#64748B]">
            {t("card.waiting")}
          </p>
          <p
            data-testid="free-period-waiting"
            className="text-[18px] font-black leading-7 text-[#0F172A]"
          >
            {period.waiting}
          </p>
          <p className="text-[11px] font-medium leading-4 text-[#64748B]">
            {t("card.waitingHint")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          data-testid="free-period-edit"
          className={actionClass}
        >
          {t("card.edit")}
        </button>
        {!ended ? (
          <button
            type="button"
            onClick={onToggle}
            disabled={busy !== null}
            data-testid="free-period-toggle"
            className={actionClass}
          >
            {busy === "toggle" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {period.isActive ? t("card.pause") : t("card.activate")}
          </button>
        ) : null}
        {period.state === "running" ? (
          <button
            type="button"
            onClick={onApply}
            disabled={busy !== null}
            data-testid="free-period-apply"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy === "apply" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("card.applyNow")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
