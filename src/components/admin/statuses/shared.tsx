"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { parseISODate } from "@/components/shared/DateField";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";
import {
  ADMIN_STATUS_MAX_TARGETS,
  remaining,
  tbilisiDateOf,
  tbilisiDateTimeOf,
  type ChangeResult,
} from "@/lib/admin-statuses";
import { Button, Pill, type Tone } from "@/components/admin/finance/ui";

// Shared client plumbing of the admin status page (C44).

type Views = Database["public"]["Views"];
export type MembershipRow = Views["admin_membership_overview_v"]["Row"];
export type ListingRow = Views["admin_listing_promotions_v"]["Row"];
export type CompanyRow = Views["admin_company_plans_v"]["Row"];

export type ListPayload<R> = {
  rows: R[];
  count: number;
  page: number;
  pageSize: number;
  stateCounts?: Record<string, number>;
  promoCounts?: Record<string, number>;
};

export type RenterPackage = {
  id: string;
  code: string;
  name: string;
  label: string | null;
  is_enabled: boolean;
  meta: { season?: string; price_tier?: string } | null;
};

export type CompanyTierPackage = {
  code: string;
  name: string;
  label: string | null;
  is_enabled: boolean;
  meta: { listing_limit?: number | null } | null;
};

export type ChangeKind = "memberships" | "listings" | "companies";

export const API_BASE: Record<ChangeKind, string> = {
  memberships: "/api/admin/statuses/memberships",
  listings: "/api/admin/statuses/listings",
  companies: "/api/admin/statuses/companies",
};

// --- URL state ---------------------------------------------------------------

/** The tab's filters live in the URL (shareable, survive a reload). */
export function useStatusQuery() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const update = useCallback(
    (changes: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!keepPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  /** Replaces every param (tab switches, "clear filters"). */
  const reset = useCallback(
    (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  /** The filters as the API reads them (no tab). */
  const apiQuery = useMemo(() => {
    const out = new URLSearchParams(searchParams.toString());
    out.delete("tab");
    return out;
  }, [searchParams]);

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const get = useCallback(
    (key: string) => searchParams.get(key) ?? "",
    [searchParams],
  );
  return { get, update, reset, apiQuery, page };
}

// --- data --------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!res.ok || !body) {
    throw new ApiError(body?.error ?? "server_error");
  }
  return body;
}

/**
 * GET with the previous payload kept while the next one loads, so the table
 * does not flash on every filter change.
 */
export function useStatusList<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then((res) => readJson<T>(res))
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.code : "server_error");
        setLoading(false);
      });
    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** A translated message for an API error code. */
export function useErrorText() {
  const t = useTranslations("AdminStatuses");
  return useCallback(
    (code: string | null | undefined) =>
      code && t.has(`errors.${code}`)
        ? t(`errors.${code}`)
        : t("errors.server_error"),
    [t],
  );
}

// --- selection -----------------------------------------------------------------

/** Selected rows by key; survives paging and filter changes within a tab. */
export function useSelection<T>() {
  const [map, setMap] = useState<Map<string, T>>(() => new Map());
  const toggle = useCallback((key: string, value: T) => {
    setMap((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }, []);
  const setMany = useCallback((items: [string, T][], on: boolean) => {
    setMap((current) => {
      const next = new Map(current);
      for (const [key, value] of items) {
        if (on) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }, []);
  const replace = useCallback((items: [string, T][]) => {
    setMap(new Map(items));
  }, []);
  const clear = useCallback(() => setMap(new Map()), []);
  return { map, size: map.size, toggle, setMany, replace, clear };
}

// --- formatting ----------------------------------------------------------------

/** The Tbilisi calendar day of an instant, in the page's language. */
export function useDayFormat() {
  const locale = useLocale();
  return useCallback(
    (instant: string | null | undefined) =>
      instant ? formatDate(parseISODate(tbilisiDateOf(instant)), locale) : "—",
    [locale],
  );
}

/** Day and Tbilisi time, e.g. "31 მარტი, 2027 23:59". */
export function useDayTimeFormat() {
  const day = useDayFormat();
  return useCallback(
    (instant: string | null | undefined) =>
      instant ? `${day(instant)} ${tbilisiDateTimeOf(instant).slice(11)}` : "—",
    [day],
  );
}

export function formatGel(amount: number): string {
  return `${amount.toFixed(2).replace(/\.00$/, "")} ₾`;
}

/** "N days" / "N h" left, or null when the instant has passed or is unset. */
export function TimeLeft({
  expiresAt,
  warnDays = 7,
}: {
  expiresAt: string | null | undefined;
  warnDays?: number;
}) {
  const t = useTranslations("AdminStatuses");
  // Captured once per render pass; display only.
  const [now] = useState(() => Date.now());
  const left = remaining(expiresAt, now);
  if (!expiresAt) return <span className="text-[#94A3B8]">—</span>;
  if (!left) {
    return <span className="text-[#94A3B8]">{t("common.ended")}</span>;
  }
  const text =
    left.days > 0
      ? t("common.daysLeft", { days: left.days })
      : t("common.hoursLeft", { hours: Math.max(1, left.hours) });
  return (
    <span
      className={cn(
        "whitespace-nowrap font-bold tabular-nums",
        left.days < warnDays ? "text-[#B45309]" : "text-[#0F172A]",
      )}
    >
      {text}
    </span>
  );
}

// --- controls ------------------------------------------------------------------

/** A checkbox with a 44px hit area; `indeterminate` for a partial page. */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <label className="-m-2 inline-flex size-11 cursor-pointer items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[18px] cursor-pointer accent-[#2563EB]"
      />
    </label>
  );
}

export type Chip = { value: string; label: string; count?: number };

/** Filter chips with counts; the active one is pressed. */
export function ChipGroup({
  chips,
  value,
  onChange,
  label,
}: {
  chips: Chip[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.value)}
            className={cn(
              "inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold transition-colors",
              active
                ? "border-[#0F172A] bg-[#0F172A] text-white"
                : "border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
            )}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-white/20" : "bg-[#F1F5F9] text-[#64748B]",
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The search box, debounced into the URL's `q`. */
export function SearchBox({
  value,
  onCommit,
  placeholder,
  loading,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    // An outside change (clear filters, back button) wins over typed text.
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text.trim() === committed.current) return;
    const timer = window.setTimeout(() => {
      committed.current = text.trim();
      onCommit(text.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, onCommit]);
  return (
    <AdminSearchInput
      value={text}
      onChange={setText}
      placeholder={placeholder}
      loading={loading}
      onClear={() => setText("")}
      className="w-full max-w-none sm:max-w-[360px]"
    />
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("AdminStatuses");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[14px] text-[#991B1B]"
    >
      <span>{message}</span>
      {onRetry && (
        <Button variant="danger" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function StatusPager({
  page,
  pageSize,
  count,
  onPage,
}: {
  page: number;
  pageSize: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("AdminStatuses");
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      className="flex items-center justify-center gap-3"
      aria-label="pagination"
    >
      <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("common.prev")}
      </Button>
      <span className="text-[13px] text-[#64748B] tabular-nums">
        {t("common.page", { page, pages })}
      </span>
      <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("common.next")}
      </Button>
    </nav>
  );
}

const MEMBERSHIP_STATE_TONES: Record<string, Tone> = {
  active: "success",
  upcoming: "info",
  pending: "warning",
  expired: "neutral",
  revoked: "danger",
  none: "neutral",
};

export function MembershipStatePill({ state }: { state: string | null }) {
  const t = useTranslations("AdminStatuses");
  const key = state ?? "none";
  return (
    <Pill tone={MEMBERSHIP_STATE_TONES[key] ?? "neutral"}>
      {t.has(`states.${key}`) ? t(`states.${key}`) : key}
    </Pill>
  );
}

export function VipPill({ tier }: { tier: string | null | undefined }) {
  const t = useTranslations("AdminStatuses");
  if (!tier) return <span className="text-[#94A3B8]">—</span>;
  return (
    <Pill
      className={
        tier === "super"
          ? "bg-[#FEF3C7] text-[#92400E]"
          : "bg-[#EDE9FE] text-[#6D28D9]"
      }
    >
      {t(`vipTiers.${tier}`)}
    </Pill>
  );
}

/** Wraps a toolbar row: count, select-all, refresh state. */
export function TableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#64748B]">
      {children}
    </div>
  );
}

/** Keys of the rows a change left untouched (they stay selected). */
export function skippedKeys(
  kind: ChangeKind,
  result: ChangeResult,
): Set<string> {
  const out = new Set<string>();
  for (const row of result.rows) {
    if (row.outcome !== "skipped") continue;
    if (kind === "memberships" && row.user_id) out.add(row.user_id);
    if (kind === "listings" && row.kind && row.target_id) {
      out.add(`${row.kind}:${row.target_id}`);
    }
    if (kind === "companies" && row.target_id) out.add(row.target_id);
  }
  return out;
}

/**
 * The bar under the table while rows are selected: count, quick actions and
 * "other action" (the full picker). Sticky inside the dashboard's scrolling
 * main, above the phone tab bar.
 */
export function SelectionBar({
  kind,
  count,
  quickActions,
  onAction,
  onClear,
}: {
  kind: ChangeKind;
  count: number;
  quickActions: readonly string[];
  onAction: (action?: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("AdminStatuses");
  if (count === 0) return null;
  const overMax = count > ADMIN_STATUS_MAX_TARGETS;
  return (
    <div
      role="region"
      aria-label={t("selection.barLabel")}
      data-testid="status-selection-bar"
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#0F172A] p-2 pl-4 text-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.55)]">
        <span className="text-[14px] font-bold tabular-nums">
          {t("selection.selected", { count })}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="min-h-[44px] px-2 text-[13px] font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
        >
          {t("selection.clear")}
        </button>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {quickActions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={overMax}
              onClick={() => onAction(action)}
              className="min-h-[44px] flex-1 rounded-xl bg-white/10 px-3 text-[13px] font-bold transition-colors hover:bg-white/20 disabled:opacity-40 sm:flex-none"
            >
              {t(`actions.${kind}.${action}`)}
            </button>
          ))}
          <button
            type="button"
            disabled={overMax}
            onClick={() => onAction(undefined)}
            className="min-h-[44px] flex-1 rounded-xl bg-white px-3 text-[13px] font-bold text-[#0F172A] transition-colors hover:bg-[#E2E8F0] disabled:opacity-40 sm:flex-none"
          >
            {t("selection.more")}
          </button>
        </div>
      </div>
      {overMax && (
        <p className="mt-2 rounded-xl bg-[#FEF2F2] px-3 py-2 text-[13px] font-semibold text-[#991B1B]">
          {t("selection.overMax", { count, max: ADMIN_STATUS_MAX_TARGETS })}
        </p>
      )}
    </div>
  );
}
