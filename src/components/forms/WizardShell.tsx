"use client";

import {
  createContext,
  useContext,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  /** Non-stepped variant only: 0-100 completion percentage. Defaults to 100%. */
  progressPercent?: number;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  mobileDensity?: "default" | "compact";
}

const WizardDensityContext = createContext<"default" | "compact">("default");

export function WizardShell({
  title,
  subtitle,
  accent = "blue",
  currentStep,
  totalSteps,
  stepLabel,
  stepTitle,
  progressPercent,
  children,
  footer,
  onSubmit,
  mobileDensity = "default",
}: WizardShellProps) {
  const t = useTranslations("Wizard");
  const stepLabelText = stepLabel ?? t("step");
  const a = ACCENT_CLASSES[accent];
  const hasSteps =
    typeof currentStep === "number" &&
    typeof totalSteps === "number" &&
    totalSteps > 0;
  const progress = hasSteps
    ? Math.round((currentStep / totalSteps) * 100)
    : typeof progressPercent === "number"
      ? Math.max(0, Math.min(100, Math.round(progressPercent)))
      : 100;
  const compact = mobileDensity === "compact";

  return (
    <WizardDensityContext.Provider value={mobileDensity}>
    <div
      className={cn(
        "mx-auto w-full max-w-[980px] px-4 py-10 sm:py-12",
        compact && "py-4 sm:py-6 lg:py-12",
      )}
    >
      <div
        className={cn(
          "rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] sm:p-8",
          compact &&
            "rounded-none border-0 bg-transparent p-0 shadow-none sm:p-0 lg:rounded-[24px] lg:border lg:bg-white lg:p-8 lg:shadow-[0px_1px_3px_rgba(0,0,0,0.05)]",
        )}
      >
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
                  {stepLabelText} {currentStep}/{totalSteps} ({progress}%)
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
            {/* Progress bar under title */}
            <div className="mt-4 h-[5px] w-full overflow-hidden rounded-full bg-[#E2E8F0]">
              <div
                className={cn("h-full rounded-full transition-all", a.bar)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} noValidate>
          {/* Content */}
          <div
            className={cn(
              "mt-7 space-y-6",
              compact && "mt-5 space-y-4 lg:mt-7 lg:space-y-6",
            )}
          >
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div
              className={cn(
                "mt-8",
                compact &&
                  "sticky bottom-0 z-20 -mx-4 mt-6 border-t border-[#E2E8F0] bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm lg:static lg:mx-0 lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
              )}
            >
              {footer}
            </div>
          )}
        </form>
      </div>
    </div>
    </WizardDensityContext.Provider>
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
  const density = useContext(WizardDensityContext);
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6",
        density === "compact" &&
          "rounded-none border-0 bg-transparent p-0 sm:p-0 lg:rounded-2xl lg:border lg:bg-white lg:p-6",
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
      <div
        className={cn(
          "mt-5 space-y-5",
          density === "compact" && "mt-4 space-y-4 lg:mt-5 lg:space-y-5",
        )}
      >
        {children}
      </div>
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
  const density = useContext(WizardDensityContext);
  return (
    <div
      className={cn(
        "space-y-5",
        density === "compact" && "space-y-4 lg:space-y-5",
        className,
      )}
    >
      {title && (
        <h2 className="text-[20px] font-black tracking-[-0.3px] text-[#0F172A]">
          {title}
        </h2>
      )}
      <div
        className={cn(
          "space-y-5",
          density === "compact" && "space-y-4 lg:space-y-5",
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface WizardFooterProps {
  accent?: Accent;
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
  submitLabel: string;
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
  backLabel,
  submitLabel,
  submitDisabled,
  loading,
  showBack = true,
  finalStep = false,
  error,
}: WizardFooterProps) {
  const tShared = useTranslations("Shared");
  const backLabelText = backLabel ?? tShared("back");
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
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A] lg:min-h-0"
            >
              <ArrowLeft className="size-4" />
              {backLabelText}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A] lg:min-h-0"
            >
              <ArrowLeft className="size-4" />
              {backLabelText}
            </button>
          )
        ) : (
          <span />
        )}
        <button
          type="submit"
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
