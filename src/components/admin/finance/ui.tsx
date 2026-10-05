"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  OctagonAlert,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Building blocks of the finance pages (C42), in the admin pages' palette.

export type Tone = "neutral" | "success" | "info" | "warning" | "danger";

const PILL_TONES: Record<Tone, string> = {
  neutral: "bg-[#F1F5F9] text-[#475569]",
  success: "bg-[#DCFCE7] text-[#15803D]",
  info: "bg-[#DBEAFE] text-[#1D4ED8]",
  warning: "bg-[#FEF3C7] text-[#B45309]",
  danger: "bg-[#FEE2E2] text-[#B91C1C]",
};

/** Register, invoice and document statuses → pill colour. */
const STATUS_TONES: Record<string, Tone> = {
  completed: "success",
  paid: "success",
  active: "success",
  pending: "info",
  issued: "info",
  sent: "info",
  partially_paid: "info",
  partially_refunded: "warning",
  refunded: "neutral",
  overdue: "warning",
  review: "warning",
  failed: "danger",
  cancelled: "neutral",
  voided: "neutral",
  draft: "neutral",
};

export function statusTone(status: string | null | undefined): Tone {
  return (status && STATUS_TONES[status]) || "neutral";
}

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[760px] space-y-2">
        <h1 className="text-[26px] font-black leading-[1.15] tracking-[-0.6px] text-[#0F172A] sm:text-[32px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] leading-[22px] text-[#64748B]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && (
              <h2 className="text-[16px] font-bold text-[#0F172A]">{title}</h2>
            )}
            {description && (
              <p className="text-[13px] leading-[20px] text-[#64748B]">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const STAT_ACCENTS: Record<Tone, string> = {
  neutral: "border-[#E2E8F0]",
  success: "border-[#BBF7D0]",
  info: "border-[#BFDBFE]",
  warning: "border-[#FDE68A]",
  danger: "border-[#FECACA]",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  badge,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  badge?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-[18px] text-[#64748B]">
          {label}
        </p>
        {badge}
      </div>
      <p className="mt-2 text-[22px] font-black leading-7 tracking-[-0.4px] text-[#0F172A] tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[12px] leading-[18px] text-[#64748B]">{hint}</p>
      )}
    </>
  );
  const className = cn(
    "block min-w-0 rounded-2xl border bg-white p-4 sm:p-5",
    STAT_ACCENTS[tone],
  );
  return href ? (
    <Link
      href={href}
      className={cn(className, "transition-colors hover:bg-[#F8FAFC]")}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const NOTICE_TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  neutral: { box: "bg-[#F8FAFC] text-[#475569]", icon: Info },
  info: { box: "bg-[#EFF6FF] text-[#1E40AF]", icon: Info },
  success: { box: "bg-[#F0FDF4] text-[#166534]", icon: CheckCircle2 },
  warning: { box: "bg-[#FFFBEB] text-[#92400E]", icon: AlertTriangle },
  danger: { box: "bg-[#FEF2F2] text-[#991B1B]", icon: OctagonAlert },
};

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = NOTICE_TONES[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl p-3 text-[13px] leading-[20px]",
        box,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A text link in a table, list or card: 44px tall (touch target). */
export const linkClass =
  "inline-flex min-h-[44px] items-center font-bold text-[#2563EB] underline-offset-2 hover:underline";

/** A link inside a Notice: the notice's own colour, 44px tall. */
export const noticeLinkClass =
  "inline-flex min-h-[44px] items-center font-bold underline underline-offset-2";

export const inputClass =
  "min-h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]";

export const textareaClass = cn(
  inputClass,
  "min-h-[88px] py-2.5 leading-[20px]",
);

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-semibold text-[#475569]"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[12px] leading-[18px] text-[#94A3B8]">{hint}</p>
      )}
    </div>
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={cn(inputClass, "cursor-pointer pr-8", className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[#0F172A] text-white hover:bg-[#1E293B]",
  secondary:
    "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
  danger: "border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]",
  ghost: "text-[#2563EB] hover:bg-[#EFF6FF]",
};

export const buttonClass = (variant: ButtonVariant = "secondary") =>
  cn(
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
  );

export function Button({
  variant = "secondary",
  loading,
  icon,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonClass(variant), className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-[#E2E8F0] p-8 text-center text-[14px] text-[#94A3B8]">
      {children}
    </p>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("AdminFinances");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[14px] text-[#991B1B]">
      <span>{message}</span>
      {onRetry && (
        <Button variant="danger" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function Skeletons({
  count = 3,
  className = "h-24",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-2xl", className)} />
      ))}
    </div>
  );
}

export function Pager({
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
  const t = useTranslations("AdminFinances");
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

const BAR_TONES: Record<"ok" | "warning" | "exceeded", string> = {
  ok: "bg-[#16A34A]",
  warning: "bg-[#F59E0B]",
  exceeded: "bg-[#DC2626]",
};

export function levelTone(level: "ok" | "warning" | "exceeded"): Tone {
  return level === "ok"
    ? "success"
    : level === "warning"
      ? "warning"
      : "danger";
}

/** How far an amount is into a threshold (spec §9-10). */
export function ThresholdBar({
  percent,
  level,
  label,
}: {
  percent: number;
  level: "ok" | "warning" | "exceeded";
  label: string;
}) {
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-[#F1F5F9]"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(percent))}
    >
      <div
        className={cn("h-full rounded-full", BAR_TONES[level])}
        style={{
          width: `${Math.min(100, Math.max(percent, percent > 0 ? 1 : 0))}%`,
        }}
      />
    </div>
  );
}
