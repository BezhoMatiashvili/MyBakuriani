import { format } from "date-fns";
import { ka } from "date-fns/locale";

export function formatPrice(amount: number): string {
  return `${formatNumber(amount)} ₾`;
}

export function formatPricePerNight(amount: number): string {
  return `${formatNumber(amount)} ₾ / ღამე`;
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

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy", { locale: ka });
}

/** Short date, e.g. "6 ივნ" — deterministic via bundled date-fns + ka locale. */
export function formatDateShort(
  date: string | Date | null | undefined,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMM", { locale: ka });
}

/** 24h time, e.g. "14:30" — deterministic via bundled date-fns. */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm", { locale: ka });
}

/** Date + time, e.g. "6 ივნისი, 2026 14:30" — deterministic via date-fns. */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy HH:mm", { locale: ka });
}

export function formatDateRange(
  start: string | Date,
  end: string | Date,
): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) {
    return `${format(s, "d", { locale: ka })} – ${format(e, "d MMMM, yyyy", { locale: ka })}`;
  }
  if (sameYear) {
    return `${format(s, "d MMMM", { locale: ka })} – ${format(e, "d MMMM, yyyy", { locale: ka })}`;
  }
  return `${format(s, "d MMMM, yyyy", { locale: ka })} – ${format(e, "d MMMM, yyyy", { locale: ka })}`;
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

export function formatRelativeGe(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ახლახან";
  if (diffMin < 60) return `${diffMin} წთ წინ`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} სთ წინ`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} დღის წინ`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo} თვის წინ`;
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
