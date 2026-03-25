import { format } from "date-fns";
import { ka } from "date-fns/locale";

/**
 * Format a price in Georgian Lari (₾).
 * Returns "X ₾" with a space before the symbol.
 */
export function formatPrice(amount: number): string {
  return `${amount.toLocaleString("ka-GE")} ₾`;
}

/**
 * Format a per-night price: "X ₾ / ღამე"
 */
export function formatPricePerNight(amount: number): string {
  return `${amount.toLocaleString("ka-GE")} ₾ / ღამე`;
}

/**
 * Format a date string or Date object using Georgian locale.
 * Output example: "25 მარტი, 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy", { locale: ka });
}

/**
 * Format a date range in Georgian locale.
 * Output example: "25 მარტი – 30 მარტი, 2026"
 */
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

/**
 * Format a Georgian phone number as +995 5XX XX XX XX.
 * Accepts raw digits like "995599123456" or "+995599123456".
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  // Expect 12 digits: 995 + 9 digit number
  if (digits.length === 12 && digits.startsWith("995")) {
    const country = digits.slice(0, 3);
    const p1 = digits.slice(3, 6);
    const p2 = digits.slice(6, 8);
    const p3 = digits.slice(8, 10);
    const p4 = digits.slice(10, 12);
    return `+${country} ${p1} ${p2} ${p3} ${p4}`;
  }

  // 9-digit local number
  if (digits.length === 9) {
    const p1 = digits.slice(0, 3);
    const p2 = digits.slice(3, 5);
    const p3 = digits.slice(5, 7);
    const p4 = digits.slice(7, 9);
    return `+995 ${p1} ${p2} ${p3} ${p4}`;
  }

  // Return as-is if format is unrecognised
  return phone;
}
