"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import DateField from "@/components/shared/DateField";
import {
  Button,
  Field,
  Notice,
  Pill,
  Select,
  inputClass,
  textareaClass,
} from "@/components/admin/finance/ui";
import { cn } from "@/lib/utils";
import {
  ADMIN_STATUS_MAX_DAYS,
  ADMIN_STATUS_MAX_END_YEARS,
  ADMIN_STATUS_NOTE_MAX,
  COMPANY_PLAN_TIERS,
  DISCOUNT_PERCENT_MAX,
  DISCOUNT_PERCENT_MIN,
  VIP_TIERS,
  addYears,
  maxEndDate,
  tbilisiToday,
  type ChangeResult,
  type ChangeRow,
  type ListingTarget,
} from "@/lib/admin-statuses";
import {
  API_BASE,
  ApiError,
  VipPill,
  formatGel,
  readJson,
  useDayTimeFormat,
  useErrorText,
  type ChangeKind,
  type CompanyTierPackage,
  type RenterPackage,
} from "./shared";

// One change of the admin status tool (C44): pick an action and its inputs,
// preview it (the RPC performs the change and rolls it back, so the preview is
// exactly what the database would write), then apply the same request.

export type ChangeTargets = {
  userIds?: string[];
  subscriptionId?: string;
  targets?: ListingTarget[];
  orgIds?: string[];
};

type Fields = {
  days?: boolean;
  end?: boolean;
  daysOrEnd?: boolean;
  vipTier?: boolean;
  companyTier?: boolean;
  percent?: boolean;
  membershipGrant?: boolean;
  period?: boolean;
  refund?: boolean;
};

function fieldsFor(kind: ChangeKind, action: string): Fields {
  if (kind === "memberships") {
    if (action === "extend" || action === "shorten") return { days: true };
    if (action === "set_end") return { end: true };
    if (action === "grant") return { membershipGrant: true };
    if (action === "revoke") return { refund: true };
    if (action === "set_period") return { period: true };
    return {};
  }
  if (kind === "listings") {
    if (action === "vip_grant") return { vipTier: true, daysOrEnd: true };
    if (action === "vip_set_tier") return { vipTier: true };
    if (action === "discount_set") return { percent: true, daysOrEnd: true };
    if (/_(extend|shorten)$/.test(action)) return { days: true };
    if (/_set_end$/.test(action)) return { end: true };
    return {};
  }
  if (action === "grant") return { companyTier: true, daysOrEnd: true };
  if (action === "set_tier") return { companyTier: true };
  if (action === "extend" || action === "shorten") return { days: true };
  if (action === "set_end") return { end: true };
  return {};
}

const QUICK_DAYS = [7, 14, 30, 90];
const WHOLE = /^\d+$/;

export type ChangeFormProps = {
  kind: ChangeKind;
  targets: ChangeTargets;
  count: number;
  /** One target's name, shown instead of the count. */
  label?: string | null;
  actions: readonly string[];
  initialAction?: string;
  packages?: RenterPackage[];
  tiers?: CompanyTierPackage[];
  /** A single membership period (drawer): its Tbilisi dates and refundable. */
  period?: { start: string; end: string; refundable: number };
  onApplied: (result: ChangeResult) => void;
  onClose: () => void;
};

export default function ChangeForm({
  kind,
  targets,
  count,
  label,
  actions,
  initialAction,
  packages = [],
  tiers = [],
  period,
  onApplied,
  onClose,
}: ChangeFormProps) {
  const t = useTranslations("AdminStatuses");
  const errorText = useErrorText();
  const today = tbilisiToday();

  const [action, setAction] = useState(
    initialAction && actions.includes(initialAction)
      ? initialAction
      : actions[0],
  );
  const [days, setDays] = useState("");
  const [mode, setMode] = useState<"days" | "date">("days");
  const [endDate, setEndDate] = useState(period?.end ?? "");
  const [startDate, setStartDate] = useState(period?.start ?? "");
  const [source, setSource] = useState<"package" | "dates">("package");
  const [packageId, setPackageId] = useState("");
  const [tier, setTier] = useState("");
  const [percent, setPercent] = useState("");
  const [refund, setRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState(
    period ? period.refundable.toFixed(2) : "",
  );
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<{
    key: string;
    result: ChangeResult;
  } | null>(null);
  const [applied, setApplied] = useState<ChangeResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const fields = fieldsFor(kind, action);

  // The exact request body; `ready` once every required input is filled.
  const { body, ready } = useMemo(() => {
    const f = fieldsFor(kind, action);
    const out: Record<string, unknown> = { action, notify };
    let ok = true;
    const trimmed = note.trim();
    if (trimmed) out.note = trimmed;

    if (kind === "memberships") {
      if (
        targets.subscriptionId &&
        (action === "set_period" || action === "revoke")
      ) {
        out.subscriptionId = targets.subscriptionId;
      } else {
        out.userIds = targets.userIds ?? [];
      }
    } else if (kind === "listings") {
      out.targets = targets.targets ?? [];
    } else {
      out.orgIds = targets.orgIds ?? [];
    }

    const dayCount = Number(days);
    const daysOk =
      WHOLE.test(days.trim()) &&
      dayCount >= 1 &&
      dayCount <= ADMIN_STATUS_MAX_DAYS;
    const useDays = f.days || (f.daysOrEnd && mode === "days");
    const useEnd = f.end || (f.daysOrEnd && mode === "date");
    if (useDays) {
      if (!daysOk) ok = false;
      out.days = dayCount;
    }
    if (useEnd) {
      if (!endDate) ok = false;
      out.endDate = endDate;
    }
    if (f.vipTier || f.companyTier) {
      if (!tier) ok = false;
      out.tier = tier;
    }
    if (f.percent) {
      const pct = Number(percent);
      if (
        !WHOLE.test(percent.trim()) ||
        pct < DISCOUNT_PERCENT_MIN ||
        pct > DISCOUNT_PERCENT_MAX
      ) {
        ok = false;
      }
      out.percent = pct;
    }
    if (f.membershipGrant) {
      if (source === "package") {
        if (!packageId) ok = false;
        out.packageId = packageId;
      } else {
        if (!endDate) ok = false;
        out.endDate = endDate;
        if (startDate) out.startDate = startDate;
        if (packageId) out.packageId = packageId;
      }
    }
    if (f.period && period) {
      // Only what the admin moved: re-sending an untouched date would snap a
      // mid-day start or end to the day boundary.
      if (startDate && startDate !== period.start) out.startDate = startDate;
      if (endDate && endDate !== period.end) out.endDate = endDate;
      if (!("startDate" in out) && !("endDate" in out)) ok = false;
    }
    if (f.refund) {
      out.refund = refund;
      if (refund && period && targets.subscriptionId) {
        const amount = Number(refundAmount.replace(",", "."));
        const cents = Math.round(amount * 100);
        const max = Math.round(period.refundable * 100);
        if (!Number.isFinite(amount) || cents <= 0 || cents > max) {
          ok = false;
        } else if (cents !== max) {
          out.refundAmount = cents / 100;
        }
      }
    }
    return { body: out, ready: ok };
  }, [
    action,
    notify,
    note,
    kind,
    targets,
    days,
    mode,
    endDate,
    startDate,
    tier,
    percent,
    source,
    packageId,
    refund,
    refundAmount,
    period,
  ]);
  const key = JSON.stringify(body);
  const previewFresh = preview !== null && preview.key === key;
  const canApply =
    previewFresh && preview.result.changed > 0 && !applied && busy === null;

  async function run(dryRun: boolean) {
    if (!ready || busy) return;
    setBusy(dryRun ? "preview" : "apply");
    setError(null);
    try {
      const res = await fetch(API_BASE[kind], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, dryRun }),
      });
      const result = await readJson<ChangeResult>(res);
      if (dryRun) {
        setPreview({ key, result });
        setUncertain(false);
      } else {
        setApplied(result);
        toast.success(t("dialog.appliedToast", { changed: result.changed }));
        onApplied(result);
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(errorText(code));
      // A lost or failed answer to an apply may still have committed (the
      // statement outlives an aborted request). Relative actions must not
      // be re-sent blindly: drop the preview so a fresh one shows the
      // current state first.
      if (!dryRun && (code === null || code === "server_error")) {
        setPreview(null);
        setUncertain(true);
      }
    } finally {
      setBusy(null);
    }
  }

  const targetLine =
    label ??
    t(
      kind === "memberships"
        ? "dialog.targetsUsers"
        : kind === "listings"
          ? "dialog.targetsListings"
          : "dialog.targetsCompanies",
      { count },
    );

  const groups: { title?: string; items: string[] }[] =
    kind === "listings"
      ? [
          {
            title: t("dialog.groupVip"),
            items: actions.filter((a) => a.startsWith("vip_")),
          },
          {
            title: t("dialog.groupDiscount"),
            items: actions.filter((a) => a.startsWith("discount_")),
          },
        ].filter((g) => g.items.length > 0)
      : [{ items: [...actions] }];

  const shown = applied ?? preview?.result ?? null;
  const locked = applied !== null;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(true);
      }}
    >
      <p className="rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-[14px] font-bold text-[#0F172A]">
        {targetLine}
      </p>

      <fieldset disabled={locked} className="min-w-0 space-y-5">
        {actions.length > 1 ? (
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-[#475569]">
              {t("dialog.action")}
            </p>
            {groups.map((group) => (
              <div
                key={group.title ?? "all"}
                role="radiogroup"
                aria-label={group.title ?? t("dialog.action")}
                className="space-y-2"
              >
                {group.title && (
                  <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-[#94A3B8]">
                    {group.title}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <label
                      key={item}
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-[13px] font-bold transition-colors",
                        item === action
                          ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                          : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
                      )}
                    >
                      <input
                        type="radio"
                        name="admin-status-action"
                        value={item}
                        checked={item === action}
                        onChange={() => setAction(item)}
                        className="size-4 accent-[#2563EB]"
                      />
                      {t(`actions.${kind}.${item}`)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[15px] font-bold text-[#0F172A]">
            {t(`actions.${kind}.${action}`)}
          </p>
        )}
        <p className="-mt-2 text-[13px] leading-[20px] text-[#64748B]">
          {t(`hints.${kind}.${action}`)}
        </p>

        {fields.daysOrEnd && (
          <Segmented
            label={t("dialog.periodMode")}
            value={mode}
            onChange={(value) => setMode(value as "days" | "date")}
            options={[
              { value: "days", label: t("dialog.modeDays") },
              { value: "date", label: t("dialog.modeDate") },
            ]}
          />
        )}

        {(fields.vipTier || fields.companyTier) && (
          <Field
            label={fields.vipTier ? t("dialog.tier") : t("dialog.companyTier")}
            htmlFor="status-tier"
          >
            <Select
              id="status-tier"
              value={tier}
              onChange={setTier}
              placeholder="—"
              options={
                fields.vipTier
                  ? VIP_TIERS.map((value) => ({
                      value,
                      label: t(`vipTiers.${value}`),
                    }))
                  : COMPANY_PLAN_TIERS.map((value) => {
                      const pkg = tiers.find(
                        (p) => p.code === `company-${value}`,
                      );
                      const limit = pkg?.meta?.listing_limit;
                      return {
                        value,
                        label: `${t(`companyTiers.${value}`)} · ${
                          typeof limit === "number"
                            ? t("dialog.limitListings", { count: limit })
                            : t("cells.unlimited")
                        }`,
                      };
                    })
              }
            />
          </Field>
        )}

        {fields.percent && (
          <Field
            label={t("dialog.percent")}
            htmlFor="status-percent"
            hint={t("dialog.percentHint", {
              min: DISCOUNT_PERCENT_MIN,
              max: DISCOUNT_PERCENT_MAX,
            })}
          >
            <input
              id="status-percent"
              inputMode="numeric"
              value={percent}
              onChange={(event) =>
                setPercent(event.target.value.replace(/\D/g, "").slice(0, 2))
              }
              className={cn(inputClass, "max-w-[160px]")}
            />
          </Field>
        )}

        {(fields.days || (fields.daysOrEnd && mode === "days")) && (
          <Field
            label={t("dialog.days")}
            htmlFor="status-days"
            hint={t("dialog.daysHint", { max: ADMIN_STATUS_MAX_DAYS })}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="status-days"
                inputMode="numeric"
                value={days}
                onChange={(event) =>
                  setDays(event.target.value.replace(/\D/g, "").slice(0, 3))
                }
                className={cn(inputClass, "max-w-[120px]")}
              />
              {QUICK_DAYS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(String(value))}
                  className={cn(
                    "min-h-[44px] min-w-[52px] rounded-xl border px-3 text-[13px] font-bold tabular-nums transition-colors",
                    days === String(value)
                      ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]"
                      : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </Field>
        )}

        {fields.membershipGrant && (
          <>
            <Segmented
              label={t("dialog.grantSource")}
              value={source}
              onChange={(value) => setSource(value as "package" | "dates")}
              options={[
                { value: "package", label: t("dialog.sourcePackage") },
                { value: "dates", label: t("dialog.sourceDates") },
              ]}
            />
            <Field label={t("dialog.package")} htmlFor="status-package">
              <Select
                id="status-package"
                value={packageId}
                onChange={setPackageId}
                placeholder={
                  source === "package"
                    ? t("dialog.packagePick")
                    : t("dialog.packageNone")
                }
                options={packages.map((pkg) => ({
                  value: pkg.id,
                  label: `${pkg.is_enabled ? pkg.name : t("dialog.packageDisabled", { name: pkg.name })}${pkg.label ? ` · ${pkg.label}` : ""}`,
                }))}
              />
            </Field>
            {source === "dates" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("dialog.startDate")}
                  hint={t("dialog.startDateHint")}
                >
                  <DateField
                    value={startDate}
                    onChange={setStartDate}
                    min={today}
                    max={endDate || maxEndDate(today)}
                    clearable
                  />
                </Field>
                <Field
                  label={t("dialog.endDate")}
                  hint={t("dialog.endDateHint")}
                >
                  <DateField
                    value={endDate}
                    onChange={setEndDate}
                    min={startDate || today}
                    max={maxEndDate(today)}
                  />
                </Field>
              </div>
            )}
          </>
        )}

        {(fields.end || (fields.daysOrEnd && mode === "date")) && (
          <Field label={t("dialog.endDate")} hint={t("dialog.endDateHint")}>
            <DateField
              value={endDate}
              onChange={setEndDate}
              min={today}
              max={maxEndDate(today)}
            />
          </Field>
        )}

        {fields.period && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("dialog.startDate")}>
              <DateField
                value={startDate}
                onChange={setStartDate}
                min={addYears(today, -ADMIN_STATUS_MAX_END_YEARS)}
                max={endDate || maxEndDate(today)}
              />
            </Field>
            <Field label={t("dialog.endDate")} hint={t("dialog.endDateHint")}>
              <DateField
                value={endDate}
                onChange={setEndDate}
                min={today}
                max={maxEndDate(today)}
              />
            </Field>
          </div>
        )}

        {fields.refund && (
          <div className="space-y-3 rounded-xl border border-[#E2E8F0] p-3">
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={refund}
                disabled={period !== undefined && period.refundable <= 0}
                onChange={(event) => setRefund(event.target.checked)}
                className="mt-1 size-[18px] accent-[#2563EB]"
              />
              <span className="space-y-0.5">
                <span className="block text-[14px] font-bold text-[#0F172A]">
                  {t("dialog.refund")}
                </span>
                <span className="block text-[12px] leading-[18px] text-[#64748B]">
                  {period
                    ? t("dialog.refundable", {
                        amount: formatGel(period.refundable),
                      })
                    : t("dialog.refundHint")}
                </span>
              </span>
            </label>
            {refund && period && targets.subscriptionId && (
              <Field label={t("dialog.refundAmount")} htmlFor="status-refund">
                <input
                  id="status-refund"
                  inputMode="decimal"
                  value={refundAmount}
                  onChange={(event) =>
                    setRefundAmount(
                      event.target.value.replace(/[^\d.,]/g, "").slice(0, 10),
                    )
                  }
                  className={cn(inputClass, "max-w-[160px]")}
                />
              </Field>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-[#E2E8F0] p-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
              className="mt-1 size-[18px] accent-[#2563EB]"
            />
            <span className="space-y-0.5">
              <span className="block text-[14px] font-bold text-[#0F172A]">
                {t("dialog.notify")}
              </span>
              <span className="block text-[12px] leading-[18px] text-[#64748B]">
                {t("dialog.notifyHint")}
              </span>
            </span>
          </label>
          <Field
            label={t("dialog.note")}
            htmlFor="status-note"
            hint={`${t("dialog.noteHint", { max: ADMIN_STATUS_NOTE_MAX })} ${note.trim().length}/${ADMIN_STATUS_NOTE_MAX}`}
          >
            <textarea
              id="status-note"
              value={note}
              maxLength={ADMIN_STATUS_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              className={textareaClass}
            />
          </Field>
        </div>
      </fieldset>

      {error && <Notice tone="danger">{error}</Notice>}
      {uncertain && (
        <Notice tone="warning">{t("dialog.applyUncertain")}</Notice>
      )}
      {preview && !previewFresh && !applied && (
        <Notice tone="warning">{t("dialog.stale")}</Notice>
      )}

      {shown && (
        <ResultSection
          kind={kind}
          action={action}
          result={shown}
          applied={applied !== null}
          notify={notify}
        />
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-[#E2E8F0] pt-4 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>
          {applied ? t("dialog.close") : t("dialog.back")}
        </Button>
        {!applied && (
          <>
            <Button
              type="submit"
              loading={busy === "preview"}
              disabled={!ready || busy !== null}
            >
              {t("dialog.preview")}
            </Button>
            <Button
              variant="primary"
              loading={busy === "apply"}
              disabled={!canApply}
              onClick={() => void run(false)}
              title={!previewFresh ? t("dialog.applyHint") : undefined}
            >
              {t("dialog.apply")}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold text-[#475569]">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-[40px] rounded-lg px-4 text-[13px] font-bold transition-colors",
              option.value === value
                ? "bg-white text-[#0F172A] shadow-sm"
                : "text-[#64748B] hover:text-[#0F172A]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- preview / result ------------------------------------------------------------

type Snap = Record<string, unknown> | null | undefined;

const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) =>
  typeof value === "number" ? value : value == null ? null : Number(value);

function ResultSection({
  kind,
  action,
  result,
  applied,
  notify,
}: {
  kind: ChangeKind;
  action: string;
  result: ChangeResult;
  applied: boolean;
  notify: boolean;
}) {
  const t = useTranslations("AdminStatuses");
  const rows = [...result.rows].sort(
    (a, b) => Number(a.outcome === "skipped") - Number(b.outcome === "skipped"),
  );
  const notices = useImpactNotices(kind, action, result, notify);
  const ref = useRef<HTMLElement>(null);
  // A new preview or result lands below the inputs: bring it into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [result]);

  return (
    <section ref={ref} className="scroll-mt-4 space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#0F172A]">
          {applied ? t("dialog.resultTitle") : t("dialog.previewTitle")}
        </h3>
        <Pill tone={result.changed > 0 ? "success" : "neutral"}>
          {applied
            ? t("dialog.appliedSummary", {
                changed: result.changed,
                skipped: result.skipped,
              })
            : t("dialog.summary", {
                changed: result.changed,
                skipped: result.skipped,
              })}
        </Pill>
      </div>
      {!applied && (
        <p className="text-[12px] leading-[18px] text-[#64748B]">
          {t("dialog.previewNote")}
        </p>
      )}
      {!applied && result.changed === 0 && (
        <Notice tone="warning">{t("dialog.nothingToChange")}</Notice>
      )}
      {notices.map((notice, i) => (
        <Notice key={i} tone={notice.tone}>
          {notice.text}
        </Notice>
      ))}
      {/* Phones: one card per row, so "after" is never off-screen. */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row, i) => (
          <li
            key={`${row.target_id ?? row.user_id ?? "row"}-${i}`}
            data-testid="status-change-card"
            data-outcome={row.outcome}
            className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 text-[13px]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-[#0F172A]">
                {rowName(row) ?? t("common.noName")}
              </p>
              <Pill tone={row.outcome === "changed" ? "success" : "warning"}>
                {row.outcome === "changed"
                  ? applied
                    ? t("dialog.applied")
                    : t("dialog.changed")
                  : t("dialog.skipped")}
              </Pill>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold uppercase text-[#94A3B8]">
                  {t("dialog.colBefore")}
                </p>
                <SnapshotCell kind={kind} action={action} snap={row.before} />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-bold uppercase text-[#94A3B8]">
                  {t("dialog.colAfter")}
                </p>
                {row.outcome === "changed" || row.after ? (
                  <SnapshotCell
                    kind={kind}
                    action={action}
                    snap={row.after}
                    compare={row.before ?? null}
                  />
                ) : (
                  <span className="text-[#94A3B8]">—</span>
                )}
              </div>
            </div>
            <RowNote kind={kind} row={row} empty={null} />
          </li>
        ))}
      </ul>
      <div className="hidden max-w-full overflow-x-auto rounded-xl border border-[#E2E8F0] sm:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[12px] font-bold text-[#475569]">
              <th scope="col" className="px-3 py-2.5">
                {t("dialog.colTarget")}
              </th>
              <th scope="col" className="px-3 py-2.5">
                {t("dialog.colBefore")}
              </th>
              <th scope="col" className="px-3 py-2.5">
                {t("dialog.colAfter")}
              </th>
              <th scope="col" className="px-3 py-2.5">
                {t("dialog.colNote")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.target_id ?? row.user_id ?? "row"}-${i}`}
                data-testid="status-change-row"
                data-outcome={row.outcome}
                className="border-b border-[#F1F5F9] align-top last:border-b-0"
              >
                <td className="px-3 py-2.5">
                  <p className="font-bold text-[#0F172A]">
                    {rowName(row) ?? t("common.noName")}
                  </p>
                  <Pill
                    tone={row.outcome === "changed" ? "success" : "warning"}
                    className="mt-1"
                  >
                    {row.outcome === "changed"
                      ? applied
                        ? t("dialog.applied")
                        : t("dialog.changed")
                      : t("dialog.skipped")}
                  </Pill>
                </td>
                <td className="px-3 py-2.5">
                  <SnapshotCell kind={kind} action={action} snap={row.before} />
                </td>
                <td className="px-3 py-2.5">
                  {row.outcome === "changed" || row.after ? (
                    <SnapshotCell
                      kind={kind}
                      action={action}
                      snap={row.after}
                      compare={row.before ?? null}
                    />
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <RowNote kind={kind} row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function rowName(row: ChangeRow): string | null {
  return row.display_name ?? row.title ?? row.brand_name ?? null;
}

/** One side of a before → after pair; values that differ are highlighted. */
function SnapshotCell({
  kind,
  action,
  snap,
  compare,
}: {
  kind: ChangeKind;
  action: string;
  snap: Snap;
  /** The before snapshot when this is the after side (null = a new row). */
  compare?: Snap;
}) {
  const t = useTranslations("AdminStatuses");
  const dayTime = useDayTimeFormat();
  if (!snap) {
    return <span className="text-[#94A3B8]">—</span>;
  }
  const isAfter = compare !== undefined;
  const changed = (field: string) =>
    isAfter &&
    JSON.stringify(compare?.[field] ?? null) !==
      JSON.stringify(snap[field] ?? null);
  const mark = (field: string, node: ReactNode) => (
    <span className={cn(changed(field) && "font-bold text-[#1D4ED8]")}>
      {node}
    </span>
  );

  if (kind === "memberships") {
    const status = str(snap.status) ?? "";
    const starts = str(snap.starts_at);
    const expires = str(snap.expires_at);
    const nowMs = Date.now();
    const shownStatus =
      status === "active" && expires && Date.parse(expires) <= nowMs
        ? "expired"
        : status === "active" && starts && Date.parse(starts) > nowMs
          ? "upcoming"
          : status;
    return (
      <div className="space-y-1 leading-[18px]">
        {isAfter && compare === null && (
          <Pill tone="info">{t("dialog.newRow")}</Pill>
        )}
        {shownStatus &&
          mark(
            "status",
            <span className="block text-[12px] font-bold text-[#475569]">
              {t.has(`periodStatuses.${shownStatus}`)
                ? t(`periodStatuses.${shownStatus}`)
                : shownStatus}
            </span>,
          )}
        <p className="tabular-nums">{mark("starts_at", dayTime(starts))} –</p>
        <p className="tabular-nums">{mark("expires_at", dayTime(expires))}</p>
      </div>
    );
  }

  if (kind === "listings") {
    if (action.startsWith("vip_")) {
      const tier = str(snap.vip_tier);
      const expires = str(snap.vip_expires_at);
      if (!tier) {
        return (
          <span className="text-[#94A3B8]">
            {changed("vip_tier") ? t("dialog.removed") : "—"}
          </span>
        );
      }
      return (
        <div className="space-y-1 leading-[18px]">
          {mark("vip_tier", <VipPill tier={tier} />)}
          <p className="tabular-nums">
            {mark(
              "vip_expires_at",
              expires ? dayTime(expires) : t("common.permanent"),
            )}
          </p>
        </div>
      );
    }
    const active = snap.discount_active === true;
    const pct = num(snap.discount_percent) ?? 0;
    const expires = str(snap.discount_expires_at);
    if (!active) {
      return (
        <span className="text-[#94A3B8]">
          {changed("discount_active") ? t("dialog.removed") : "—"}
        </span>
      );
    }
    return (
      <div className="space-y-1 leading-[18px]">
        {mark(
          "discount_percent",
          <span className="font-bold tabular-nums">{pct}%</span>,
        )}
        <p className="tabular-nums">
          {mark(
            "discount_expires_at",
            expires ? dayTime(expires) : t("common.permanent"),
          )}
        </p>
      </div>
    );
  }

  const tier = str(snap.tier);
  const limit = num(snap.listing_limit);
  const status = str(snap.status) ?? "";
  return (
    <div className="space-y-1 leading-[18px]">
      {isAfter && compare === null && (
        <Pill tone="info">{t("dialog.newRow")}</Pill>
      )}
      <p>
        {mark(
          "tier",
          <span className="font-bold">
            {tier && t.has(`companyTiers.${tier}`)
              ? t(`companyTiers.${tier}`)
              : (tier ?? "—")}
          </span>,
        )}{" "}
        ·{" "}
        {mark(
          "listing_limit",
          limit === null
            ? t("cells.unlimited")
            : t("dialog.limitListings", { count: limit }),
        )}
      </p>
      <p className="tabular-nums">
        {mark("starts_at", dayTime(str(snap.starts_at)))} –
      </p>
      <p className="tabular-nums">
        {mark("expires_at", dayTime(str(snap.expires_at)))}
      </p>
      {mark(
        "status",
        <span className="block text-[12px] font-bold text-[#475569]">
          {t.has(`planStatuses.${status}`)
            ? t(`planStatuses.${status}`)
            : status}
        </span>,
      )}
    </div>
  );
}

function RowNote({
  kind,
  row,
  empty = <span className="text-[#94A3B8]">—</span>,
}: {
  kind: ChangeKind;
  row: ChangeRow;
  /** What a row without a note shows (the phone card shows nothing). */
  empty?: ReactNode;
}) {
  const t = useTranslations("AdminStatuses");
  if (row.outcome === "skipped") {
    const reason = row.reason ?? "no_change";
    return (
      <span className="font-semibold text-[#B45309]">
        {t.has(`reasons.${reason}`) ? t(`reasons.${reason}`) : reason}
      </span>
    );
  }
  const effects = row.effects ?? {};
  const lines: ReactNode[] = [];
  if (kind === "memberships") {
    const rentals = num(effects.active_rentals) ?? 0;
    if (
      rentals > 0 &&
      effects.covered_before === true &&
      effects.covered_after === false
    ) {
      lines.push(
        <span key="hide" className="font-semibold text-[#B91C1C]">
          {t("dialog.effectHidden", { count: rentals })}
        </span>,
      );
    }
    if (
      rentals > 0 &&
      effects.covered_before === false &&
      effects.covered_after === true
    ) {
      lines.push(
        <span key="show" className="font-semibold text-[#15803D]">
          {t("dialog.effectShown", { count: rentals })}
        </span>,
      );
    }
    const refund = num(effects.refund) ?? 0;
    if (refund > 0) {
      lines.push(
        <span key="refund">
          {t("dialog.effectRefund", { amount: formatGel(refund) })}
        </span>,
      );
    }
  }
  if (kind === "companies") {
    const used = num(effects.used_listings);
    const limit = num(row.after?.listing_limit);
    if (used !== null) {
      lines.push(
        <span
          key="usage"
          className={cn(
            effects.over_limit === true && "font-semibold text-[#B91C1C]",
          )}
        >
          {t("dialog.effectUsage", {
            used,
            limit: limit === null ? t("cells.unlimited") : limit,
          })}
        </span>,
      );
    }
    const linked = num(effects.linked_listings) ?? 0;
    if (linked > 0) {
      lines.push(
        <span key="linked">{t("dialog.effectLinked", { count: linked })}</span>,
      );
    }
  }
  if (lines.length === 0) return empty;
  return <div className="flex flex-col gap-1">{lines}</div>;
}

type ImpactNotice = { tone: "info" | "warning" | "danger"; text: string };

function useImpactNotices(
  kind: ChangeKind,
  action: string,
  result: ChangeResult,
  notify: boolean,
): ImpactNotice[] {
  const t = useTranslations("AdminStatuses");
  const out: ImpactNotice[] = [];
  const changed = result.rows.filter((row) => row.outcome === "changed");

  if (kind === "memberships") {
    const hide = new Map<string, number>();
    const show = new Map<string, number>();
    let refund = 0;
    for (const row of changed) {
      const e = row.effects ?? {};
      const rentals = num(e.active_rentals) ?? 0;
      if (row.user_id && rentals > 0) {
        if (e.covered_before === true && e.covered_after === false) {
          hide.set(row.user_id, rentals);
        }
        if (e.covered_before === false && e.covered_after === true) {
          show.set(row.user_id, rentals);
        }
      }
      refund += num(e.refund) ?? 0;
    }
    const sum = (m: Map<string, number>) =>
      [...m.values()].reduce((a, b) => a + b, 0);
    if (hide.size > 0) {
      out.push({
        tone: "danger",
        text: t("dialog.impactHide", { users: hide.size, rentals: sum(hide) }),
      });
    }
    if (show.size > 0) {
      out.push({
        tone: "info",
        text: t("dialog.impactShow", { users: show.size, rentals: sum(show) }),
      });
    }
    if (refund > 0) {
      out.push({
        tone: "info",
        text: t("dialog.impactRefund", {
          amount: formatGel(Math.round(refund * 100) / 100),
        }),
      });
    }
  }

  if (kind === "companies") {
    for (const row of changed) {
      const e = row.effects ?? {};
      const name = row.brand_name ?? t("common.noName");
      if (e.over_limit === true) {
        out.push({
          tone: "warning",
          text: t("dialog.impactOverLimit", {
            name,
            used: num(e.used_listings) ?? 0,
            limit: num(row.after?.listing_limit) ?? 0,
          }),
        });
      }
      const linked = num(e.linked_listings) ?? 0;
      if (linked > 0) {
        out.push({
          tone: "info",
          text: t("dialog.impactLinked", { name, count: linked }),
        });
      }
      if (typeof e.auto_link_error === "string" && e.auto_link_error) {
        out.push({
          tone: "warning",
          text: t("dialog.impactLinkFailed", { name }),
        });
      }
    }
    if (action === "end" && changed.length > 0) {
      out.push({ tone: "info", text: t("dialog.impactPlanEnd") });
    }
  }

  if (notify && changed.length > 0) {
    const people = new Set(
      changed
        .map((row) =>
          kind === "memberships" ? row.user_id : (row.owner_id ?? null),
        )
        .filter(Boolean),
    );
    if (people.size > 0) {
      out.push({
        tone: "info",
        text: t("dialog.impactNotify", { count: people.size }),
      });
    }
  }
  return out;
}
