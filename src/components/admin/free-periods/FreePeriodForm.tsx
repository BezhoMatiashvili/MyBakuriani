"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import DateField from "@/components/shared/DateField";
import {
  FREE_PERIOD_BENEFITS,
  FREE_PERIOD_ERROR_CODES,
  FREE_PERIOD_MAX_END_YEARS,
  FREE_PERIOD_MAX_LISTINGS_LIMIT,
  FREE_PERIOD_NAME_MAX,
  FREE_PERIOD_ROLES,
  addDays,
  addYears,
  defaultRoles,
  formatDay,
  isSeasonEnd,
  tbilisiToday,
  type FreePeriodApplyResult,
  type FreePeriodBenefit,
  type FreePeriodRole,
  type FreePeriodView,
} from "@/lib/free-periods";

// Create / edit one free period (C53). The benefit is chosen once; every other
// field stays editable (an ended period keeps its end date). Dates are Tbilisi
// days; the server re-validates everything.

export type SaveResult = {
  period: FreePeriodView | null;
  apply: FreePeriodApplyResult | null;
};

type Props = {
  period: FreePeriodView | null;
  onSaved: (result: SaveResult, created: boolean) => void;
  onClose: () => void;
};

const INPUT_CLASS =
  "h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10 disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]";
const LABEL_CLASS =
  "block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]";
const HINT_CLASS = "pl-1 text-[11px] font-medium leading-4 text-[#64748B]";

export default function FreePeriodForm({ period, onSaved, onClose }: Props) {
  const t = useTranslations("AdminFreePeriods");
  const tShared = useTranslations("AdminShared");
  const today = tbilisiToday();
  const editing = period !== null;
  const ended = period?.state === "ended";

  const [name, setName] = useState(period?.name ?? "");
  const [benefit, setBenefit] = useState<FreePeriodBenefit>(
    period?.benefit ?? "membership",
  );
  const [from, setFrom] = useState(period?.registrationFrom ?? today);
  const [to, setTo] = useState(period?.registrationTo ?? addDays(today, 9));
  const [endDate, setEndDate] = useState(period?.endDate ?? addDays(today, 60));
  const [roles, setRoles] = useState<FreePeriodRole[]>(
    period?.roles ?? defaultRoles("membership"),
  );
  const [maxListings, setMaxListings] = useState(
    period?.maxListings ? String(period.maxListings) : "",
  );
  const [isActive, setIsActive] = useState(period?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until the admin ticks a role by hand, switching the benefit re-picks the
  // sensible default roles (renters for a membership, everyone for VIP).
  const rolesTouched = useRef(editing);

  function changeBenefit(next: FreePeriodBenefit) {
    setBenefit(next);
    if (!rolesTouched.current) setRoles(defaultRoles(next));
    if (next === "membership") setMaxListings("");
  }

  function changeFrom(value: string) {
    setFrom(value);
    if (value > to) setTo(value);
    if (value > endDate) setEndDate(value);
  }

  function changeTo(value: string) {
    setTo(value);
    if (value > endDate) setEndDate(value);
  }

  function toggleRole(role: FreePeriodRole) {
    rolesTouched.current = true;
    setRoles((previous) =>
      previous.includes(role)
        ? previous.filter((r) => r !== role)
        : FREE_PERIOD_ROLES.filter((r) => r === role || previous.includes(r)),
    );
  }

  function errorText(code: unknown): string {
    return (FREE_PERIOD_ERROR_CODES as readonly unknown[]).includes(code)
      ? t(`errors.${code as (typeof FREE_PERIOD_ERROR_CODES)[number]}`)
      : t("errors.server_error");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const limit = maxListings.trim() === "" ? null : Number(maxListings);
    let body: Record<string, unknown>;
    if (period) {
      body = {};
      if (name.trim() !== period.name) body.name = name;
      if (from !== period.registrationFrom) body.registrationFrom = from;
      if (to !== period.registrationTo) body.registrationTo = to;
      if (endDate !== period.endDate) body.endDate = endDate;
      if (roles.join() !== period.roles.join()) body.roles = roles;
      if (benefit !== "membership" && limit !== period.maxListings) {
        body.maxListings = limit;
      }
      if (isActive !== period.isActive) body.isActive = isActive;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    } else {
      body = {
        name,
        benefit,
        registrationFrom: from,
        registrationTo: to,
        endDate,
        roles,
        maxListings: benefit === "membership" ? null : limit,
        isActive,
      };
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        period
          ? `/api/admin/free-periods/${period.id}`
          : "/api/admin/free-periods",
        {
          method: period ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorText(payload?.error));
        return;
      }
      onSaved(payload as SaveResult, !period);
    } catch {
      setError(t("errors.server_error"));
    } finally {
      setSaving(false);
    }
  }

  const endMin = to > today ? to : today;
  const summaryRoles =
    roles.length === FREE_PERIOD_ROLES.length
      ? t("form.allRoles")
      : roles.map((role) => tShared(`roles.${role}`)).join(", ");
  const showSeasonHint =
    benefit === "membership" && Boolean(endDate) && !isSeasonEnd(endDate);

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="free-period-form"
      className="flex flex-col gap-5"
    >
      <div className="space-y-2">
        <label htmlFor="fp-name" className={LABEL_CLASS}>
          {t("form.name")}
        </label>
        <input
          id="fp-name"
          type="text"
          maxLength={FREE_PERIOD_NAME_MAX}
          value={name}
          placeholder={t("form.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="fp-benefit" className={LABEL_CLASS}>
          {t("form.benefit")}
        </label>
        <select
          id="fp-benefit"
          value={benefit}
          disabled={editing}
          onChange={(e) => changeBenefit(e.target.value as FreePeriodBenefit)}
          className={`${INPUT_CLASS} px-4`}
        >
          {FREE_PERIOD_BENEFITS.map((b) => (
            <option key={b} value={b}>
              {t(`benefit.${b}`)}
            </option>
          ))}
        </select>
        {editing ? (
          <p className={HINT_CLASS}>{t("form.benefitLocked")}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="fp-from" className={LABEL_CLASS}>
            {t("form.registrationFrom")}
          </label>
          <DateField
            id="fp-from"
            value={from}
            onChange={changeFrom}
            className="h-[55px] rounded-2xl"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="fp-to" className={LABEL_CLASS}>
            {t("form.registrationTo")}
          </label>
          <DateField
            id="fp-to"
            value={to}
            onChange={changeTo}
            min={from}
            className="h-[55px] rounded-2xl"
          />
        </div>
      </div>
      <p className={`-mt-2 ${HINT_CLASS}`}>{t("form.windowHint")}</p>

      <div className="space-y-2">
        <label htmlFor="fp-end" className={LABEL_CLASS}>
          {t("form.endDate")}
        </label>
        <DateField
          id="fp-end"
          value={endDate}
          onChange={setEndDate}
          min={endMin}
          max={addYears(today, FREE_PERIOD_MAX_END_YEARS)}
          disabled={ended}
          className="h-[55px] rounded-2xl"
        />
        <p className={HINT_CLASS}>
          {ended ? t("form.endedNote") : t("form.endDateHint")}
        </p>
        {showSeasonHint && !ended ? (
          <p
            data-testid="free-period-season-hint"
            className="rounded-xl bg-[#FFFBEB] px-3 py-2 text-[12px] font-medium leading-[18px] text-[#92400E]"
          >
            {t("form.seasonHint")}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className={LABEL_CLASS}>{t("form.roles")}</legend>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
          {FREE_PERIOD_ROLES.map((role) => (
            <label
              key={role}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-[#1E293B] has-[:checked]:border-[#2563EB] has-[:checked]:bg-[#EFF6FF]"
            >
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
                data-testid={`free-period-role-${role}`}
                className="h-4 w-4 accent-[#2563EB]"
              />
              {tShared(`roles.${role}`)}
            </label>
          ))}
        </div>
        <p className={HINT_CLASS}>{t("form.rolesHint")}</p>
      </fieldset>

      {benefit !== "membership" ? (
        <div className="space-y-2">
          <label htmlFor="fp-max" className={LABEL_CLASS}>
            {t("form.maxListings")}
          </label>
          <input
            id="fp-max"
            type="number"
            inputMode="numeric"
            min={1}
            max={FREE_PERIOD_MAX_LISTINGS_LIMIT}
            value={maxListings}
            placeholder={t("form.maxListingsPlaceholder")}
            onChange={(e) => setMaxListings(e.target.value)}
            className={INPUT_CLASS}
          />
          <p className={HINT_CLASS}>{t("form.maxListingsHint")}</p>
        </div>
      ) : null}

      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl bg-[#F8FAFC] px-3 py-3">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          data-testid="free-period-active"
          className="mt-0.5 h-4 w-4 accent-[#2563EB]"
        />
        <span className="space-y-0.5">
          <span className="block text-[13px] font-bold text-[#1E293B]">
            {t("form.active")}
          </span>
          <span className="block text-[11px] font-medium leading-4 text-[#64748B]">
            {t("form.activeHint")}
          </span>
        </span>
      </label>

      <p
        data-testid="free-period-summary"
        className="rounded-xl bg-[#EFF6FF] px-3 py-3 text-[12px] font-medium leading-[18px] text-[#1E3A8A]"
      >
        {t("form.summary", {
          roles: summaryRoles,
          from: formatDay(from),
          to: formatDay(to),
          benefit: t(`benefit.${benefit}`),
          date: formatDay(endDate),
        })}
      </p>

      {error ? (
        <p
          role="alert"
          data-testid="free-period-error"
          className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-[13px] font-medium text-[#B91C1C]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-[14px] font-bold text-[#334155]"
        >
          {t("form.cancel")}
        </button>
        <button
          type="submit"
          disabled={saving}
          data-testid="free-period-save"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-6 text-[14px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editing ? t("form.save") : t("form.create")}
        </button>
      </div>
    </form>
  );
}
