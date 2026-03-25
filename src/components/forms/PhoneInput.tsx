"use client";

import { useCallback, ChangeEvent } from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

/**
 * Formats a raw digit string (e.g. "555123456") as "5XX XX XX XX"
 */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 7)
    return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
}

function stripFormat(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

export default function PhoneInput({
  value,
  onChange,
  error,
}: PhoneInputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = stripFormat(e.target.value);
      onChange(raw);
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      <div
        className={`flex items-center overflow-hidden rounded-lg border bg-background transition-colors focus-within:ring-2 focus-within:ring-ring/50 ${
          error
            ? "border-destructive focus-within:ring-destructive/20"
            : "border-input"
        }`}
      >
        {/* Prefix */}
        <span className="flex shrink-0 items-center gap-1.5 border-r border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span>🇬🇪</span>
          <span>+995</span>
        </span>

        {/* Input */}
        <input
          type="tel"
          inputMode="numeric"
          value={formatPhone(value)}
          onChange={handleChange}
          placeholder="5XX XX XX XX"
          className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Error message */}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
