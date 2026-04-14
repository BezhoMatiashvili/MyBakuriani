import { format } from "date-fns";
import { ka } from "date-fns/locale";

export function formatPrice(amount: number): string {
  return `${formatNumber(amount)} ₾`;
}

export function formatPricePerNight(amount: number): string {
  return `${formatNumber(amount)} ₾ / ღამე`;
}

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM, yyyy", { locale: ka });
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

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("995")) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  }
  if (digits.length === 9) {
    return `+995 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return phone;
}
