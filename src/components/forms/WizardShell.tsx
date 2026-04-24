"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "green" | "orange";

const ACCENT_CLASSES: Record<
  Accent,
  {
    bar: string;
    circle: string;
    primary: string;
    primaryHover: string;
    shadow: string;
  }
> = {
  blue: {
    bar: "bg-[#2563EB]",
    circle: "bg-[#DBEAFE] text-[#2563EB]",
    primary: "bg-[#2563EB] text-white",
    primaryHover: "hover:bg-[#1D4ED8]",
    shadow: "shadow-[0px_8px_20px_rgba(37,99,235,0.25)]",
  },
  green: {
    bar: "bg-[#16A34A]",
    circle: "bg-[#DCFCE7] text-[#16A34A]",
    primary: "bg-[#16A34A] text-white",
    primaryHover: "hover:bg-[#15803D]",
    shadow: "shadow-[0px_8px_20px_rgba(22,163,74,0.25)]",
  },
  orange: {
    bar: "bg-[#F97316]",
    circle: "bg-[#FFEDD5] text-[#F97316]",
    primary: "bg-[#F97316] text-white",
    primaryHover: "hover:bg-[#EA6C0E]",
    shadow: "shadow-[0px_8px_20px_rgba(249,115,22,0.25)]",
  },
};

interface WizardShellProps {
  /** Big page title shown at top-left of outer card */
  title: string;
  /** Small subtitle shown below the title */
  subtitle?: string;
  /** Accent color theme for progress bar and section numbers */
  accent?: Accent;
  /** If set with totalSteps, shows number circle, step meta & full progress bar — stepped (rental) variant */
  currentStep?: number;
  totalSteps?: number;
  stepLabel?: string;
  /** If stepped, the step-name shown next to the number circle */
  stepTitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function WizardShell({
  title,
  subtitle,
  accent = "blue",
  currentStep,
  totalSteps,
  stepLabel = "ნაბიჯი",
  stepTitle,
  children,
  footer,
}: WizardShellProps) {
  const a = ACCENT_CLASSES[accent];
  const hasSteps =
    typeof currentStep === "number" &&
    typeof totalSteps === "number" &&
    totalSteps > 0;
  const progress = hasSteps
    ? Math.round((currentStep / totalSteps) * 100)
    : 100;

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-10 sm:py-12">
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] sm:p-8">
        {hasSteps ? (
          <>
            {/* Stepped header (rental) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
                    a.circle,
                  )}
                >
                  {currentStep}
                </span>
                <h1 className="text-[20px] font-black leading-7 tracking-[-0.4px] text-[#0F172A] sm:text-[22px]">
                  {stepTitle ?? title}
                </h1>
              </div>
              <div className="flex w-full flex-col items-end gap-1.5 sm:w-[200px]">
                <span className="text-xs font-semibold text-[#64748B]">
                  {stepLabel} {currentStep}/{totalSteps} ({progress}%)
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div
                    className={cn("h-full rounded-full transition-all", a.bar)}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            {/* Full-width step progress bar */}
            <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-[#E2E8F0]">
              <div
                className={cn("h-full rounded-full transition-all", a.bar)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            {/* Simple header (non-stepped) */}
            <div>
              <h1 className="text-[24px] font-black leading-8 tracking-[-0.6px] text-[#0F172A] sm:text-[28px]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  {subtitle}
                </p>
              )}
            </div>
            {/* Accent bar under title */}
            <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[#E2E8F0]">
              <div className={cn("h-full rounded-full", a.bar)} />
            </div>
          </>
        )}

        {/* Content */}
        <div className="mt-7 space-y-6">{children}</div>

        {/* Footer */}
        {footer && <div className="mt-8">{footer}</div>}
      </div>
    </div>
  );
}

interface WizardInnerCardProps {
  number?: number;
  title: string;
  accent?: Accent;
  children: ReactNode;
  className?: string;
}

/** Nested inner card used by non-rental single-step wizards */
export function WizardInnerCard({
  number,
  title,
  accent = "blue",
  children,
  className,
}: WizardInnerCardProps) {
  const a = ACCENT_CLASSES[accent];
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        {typeof number === "number" && (
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              a.circle,
            )}
          >
            {number}
          </span>
        )}
        <h2 className="text-[15px] font-bold text-[#334155]">{title}</h2>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </div>
  );
}

/** Flat section used by rental wizard (no inner card) */
interface WizardSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function WizardSection({
  title,
  children,
  className,
}: WizardSectionProps) {
  return (
    <div className={cn("space-y-5", className)}>
      {title && (
        <h2 className="text-[20px] font-black tracking-[-0.3px] text-[#0F172A]">
          {title}
        </h2>
      )}
      <div className="space-y-5">{children}</div>
    </div>
  );
}

interface WizardFooterProps {
  accent?: Accent;
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
  onSubmit?: () => void;
  submitLabel: string;
  submitType?: "button" | "submit";
  submitDisabled?: boolean;
  loading?: boolean;
  showBack?: boolean;
  finalStep?: boolean;
  error?: string | null;
}

export function WizardFooter({
  accent = "blue",
  onBack,
  backHref,
  backLabel = "უკან დაბრუნება",
  onSubmit,
  submitLabel,
  submitType = "button",
  submitDisabled,
  loading,
  showBack = true,
  finalStep = false,
  error,
}: WizardFooterProps) {
  const a = ACCENT_CLASSES[accent];
  // Final step of a stepped flow uses orange accent for the publish button per design
  const submitAccent = finalStep ? ACCENT_CLASSES.orange : a;

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-[#EF4444]" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        {showBack ? (
          backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
            >
              <ArrowLeft className="size-4" />
              {backLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
            >
              <ArrowLeft className="size-4" />
              {backLabel}
            </button>
          )
        ) : (
          <span />
        )}
        <button
          type={submitType}
          onClick={onSubmit}
          disabled={submitDisabled || loading}
          className={cn(
            "inline-flex h-[44px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            submitAccent.primary,
            submitAccent.primaryHover,
            submitAccent.shadow,
          )}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : finalStep ? (
            <>
              {submitLabel}
              <Check className="size-4" />
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </div>
  );
}

export { ACCENT_CLASSES };
export type { Accent };
