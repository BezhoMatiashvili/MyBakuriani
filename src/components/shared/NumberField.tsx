"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clampNumber,
  clampNumericString,
  parseNumeric,
  sanitizeNumericString,
} from "@/lib/utils/number";

type Accent = "blue" | "green" | "orange";

const ACCENT: Record<Accent, { focus: string; ring: string }> = {
  blue: { focus: "focus:border-[#2563EB]", ring: "focus:ring-[#DBEAFE]" },
  green: { focus: "focus:border-[#16A34A]", ring: "focus:ring-[#DCFCE7]" },
  orange: { focus: "focus:border-[#F97316]", ring: "focus:ring-[#FFEDD5]" },
};

const ACCENT_WITHIN: Record<Accent, string> = {
  blue: "focus-within:border-[#2563EB] focus-within:ring-[#DBEAFE]",
  green: "focus-within:border-[#16A34A] focus-within:ring-[#DCFCE7]",
  orange: "focus-within:border-[#F97316] focus-within:ring-[#FFEDD5]",
};

interface NumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  /** Stepper increment (default 1). */
  step?: number;
  integer?: boolean;
  /** Decimal places to round to on blur (ignored when integer). */
  decimals?: number;
  allowNegative?: boolean;
  suffix?: string;
  prefix?: string;
  accent?: Accent;
  /** Render −/+ buttons flanking a centered value (best for small counts). */
  stepper?: boolean;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  inputMode?: "numeric" | "decimal";
  id?: string;
  className?: string;
  onBlur?: (value: string) => void;
}

export default function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  integer,
  decimals,
  allowNegative = false,
  suffix,
  prefix,
  accent = "blue",
  stepper = false,
  placeholder,
  disabled,
  error,
  inputMode,
  id,
  className,
  onBlur,
}: NumberFieldProps) {
  const clampOpts = { min, max, integer, decimals };
  const allowDecimal = !integer;

  const handleChange = (raw: string) => {
    onChange(sanitizeNumericString(raw, { allowNegative, allowDecimal }));
  };

  const handleBlur = () => {
    const clamped = clampNumericString(value, clampOpts);
    if (clamped !== value) onChange(clamped);
    onBlur?.(clamped);
  };

  const nudge = (delta: number) => {
    const base = parseNumeric(value);
    const start = base ?? (typeof min === "number" ? min : 0);
    onChange(String(clampNumber(start + delta, clampOpts)));
  };

  const current = parseNumeric(value);
  const atMin = typeof min === "number" && current !== null && current <= min;
  const atMax = typeof max === "number" && current !== null && current >= max;
  const resolvedInputMode = inputMode ?? (allowDecimal ? "decimal" : "numeric");

  if (stepper) {
    return (
      <div
        className={cn(
          "flex h-12 items-stretch overflow-hidden rounded-xl border bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors focus-within:ring-2",
          error ? "border-[#EF4444]" : "border-[#E2E8F0]",
          ACCENT_WITHIN[accent],
          disabled && "opacity-60",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => nudge(-step)}
          disabled={disabled || atMin}
          aria-label="−"
          className="flex w-12 shrink-0 items-center justify-center text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:text-[#CBD5E1]"
        >
          <Minus className="size-4" strokeWidth={2.5} />
        </button>
        <input
          id={id}
          type="text"
          inputMode={resolvedInputMode}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 border-x border-[#E2E8F0] bg-white px-2 text-center text-sm font-bold text-[#0F172A] outline-none disabled:bg-[#F8FAFC]"
        />
        <button
          type="button"
          onClick={() => nudge(step)}
          disabled={disabled || atMax}
          aria-label="+"
          className="flex w-12 shrink-0 items-center justify-center text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:text-[#CBD5E1]"
        >
          <Plus className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-1.5 left-1.5 flex w-9 items-center justify-center rounded-lg bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
          {prefix}
        </span>
      )}
      <input
        id={id}
        type="text"
        inputMode={resolvedInputMode}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none transition-colors focus:ring-2 disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
          error ? "border-[#EF4444]" : "border-[#E2E8F0]",
          ACCENT[accent].focus,
          ACCENT[accent].ring,
          prefix && "pl-12",
          suffix && "pr-14",
          className,
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-1.5 right-1.5 flex w-11 items-center justify-center rounded-lg bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
          {suffix}
        </span>
      )}
    </div>
  );
}

export type { Accent };
