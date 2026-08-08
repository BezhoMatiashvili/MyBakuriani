import { format } from "date-fns";
import { ka, enUS, ru } from "date-fns/locale";
import type { Locale } from "date-fns";
import {
  NIGHT_LABELS,
  RELATIVE_LABELS,
  type FormatLocale,
} from "./format-locale-labels";

const DATE_FNS_LOCALES: Record<FormatLocale, Locale> = {
  ka,
  en: enUS,
  ru,
};

function normalizeLocale(locale?: string): FormatLocale {
  return locale === "en" || locale === "ru" ? locale : "ka";
}

/** date-fns locale for a next-intl locale string ("ka" | "en" | "ru"). */
export function getDateFnsLocale(locale?: string): Locale {
  return DATE_FNS_LOCALES[normalizeLocale(locale)];
}

export function formatPrice(amount: number): string {
  return `${formatNumber(amount)} ₾`;
}

export function formatPricePerNight(amount: number, locale?: string): string {
  return `${formatNumber(amount)} ₾ / ${NIGHT_LABELS[normalizeLocale(locale)]}`;
}

/**
 * Deterministic integer grouping with a thin space — identical on the server
 * (Node) and the client (browser) regardless of runtime locale/ICU data.
 * Use this instead of `Number.prototype.toLocaleString()` which varies per
 * device locale and causes hydration mismatches.
 */
export function formatNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatDate(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy", { locale: getDateFnsLocale(locale) });
}

/** Short date ("d MMM") — deterministic via bundled date-fns locales. */
export function formatDateShort(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMM", { locale: getDateFnsLocale(locale) });
}

/** 24h time, e.g. "14:30" — deterministic via bundled date-fns. */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm", { locale: ka });
}

/** Date + time ("d MMMM, yyyy HH:mm") — deterministic via date-fns. */
export function formatDateTime(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy HH:mm", { locale: getDateFnsLocale(locale) });
}

export function formatDateRange(
  start: string | Date,
  end: string | Date,
  locale?: string,
): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const l = getDateFnsLocale(locale);

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) {
    return `${format(s, "d", { locale: l })} – ${format(e, "d MMMM, yyyy", { locale: l })}`;
  }
  if (sameYear) {
    return `${format(s, "d MMMM", { locale: l })} – ${format(e, "d MMMM, yyyy", { locale: l })}`;
  }
  return `${format(s, "d MMMM, yyyy", { locale: l })} – ${format(e, "d MMMM, yyyy", { locale: l })}`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("995")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.length === 9) {
    return `+995 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return phone;
}

export function formatRelativeGe(
  iso: string | null | undefined,
  locale?: string,
  now = Date.now(),
): string {
  if (!iso) return "";
  const labels = RELATIVE_LABELS[normalizeLocale(locale)];
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = now - then;
  if (diffMs < 0) return "";
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return labels.justNow;
  if (diffMin < 60) return labels.minutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return labels.hoursAgo(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return labels.daysAgo(diffDay);
  const diffMo = Math.floor(diffDay / 30);
  return labels.monthsAgo(diffMo);
}

const LISTING_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True only for valid listing timestamps in the rolling previous 24 hours. */
export function isListingNewlyAdded(
  iso: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return false;
  const age = now - then;
  return age >= 0 && age < LISTING_NEW_WINDOW_MS;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const formatted = formatPhone(phone);
  let remaining = 3;
  return formatted
    .split("")
    .reverse()
    .map((ch) => {
      if (remaining > 0 && /\d/.test(ch)) {
        remaining--;
        return "*";
      }
      return ch;
    })
    .reverse()
    .join("");
}
