"use client";
import { useCallback, ChangeEvent } from "react";
import { groupGePhone, sanitizeGePhone } from "@/lib/utils/number";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  id?: string;
  autoComplete?: string;
  /**
   * A listing's or company's contact number, which may also be a landline
   * (C56): the placeholder gives a landline example, and the caller checks the
   * number with isValidGeContactPhone and passes the error. Never on a
   * WhatsApp, profile or sign-in field.
   */
  allowLandline?: boolean;
  /** For a column too narrow for the landline example. */
  placeholder?: string;
}

export default function PhoneInput({
  value,
  onChange,
  error,
  id,
  autoComplete,
  allowLandline,
  placeholder = allowLandline ? "5XX XX XX XX / 32 2XX XX XX" : "5XX XX XX XX",
}: PhoneInputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      // A pasted or autofilled "+995 5XX …", "00995 …" or "0322 …" keeps the
      // local number, not "9955XXXXX".
      onChange(sanitizeGePhone(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      <div
        className={`flex h-[52px] md:h-[50px] items-center overflow-hidden rounded-xl border bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#DBEAFE] ${error ? "border-[#EF4444] focus-within:ring-[#EF4444]/20" : "border-[#E2E8F0]"}`}
      >
        <span className="flex shrink-0 items-center gap-1.5 border-r border-[#E2E8F0] bg-[#F8FAFC] px-3 md:px-4 py-3 text-sm font-bold text-[#94A3B8]">
          <span>+995</span>
        </span>
        <input
          id={id}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          type="tel"
          inputMode="numeric"
          value={groupGePhone(value.replace(/\D/g, "").slice(0, 9))}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full bg-transparent px-4 py-3 text-sm font-bold outline-none placeholder:font-medium placeholder:text-[#94A3B8]/50"
        />
      </div>
      {error && <p className="text-xs text-[#EF4444]">{error}</p>}
    </div>
  );
}
