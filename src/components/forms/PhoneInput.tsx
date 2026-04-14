"use client";
import { useCallback, ChangeEvent } from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}

export default function PhoneInput({
  value,
  onChange,
  error,
}: PhoneInputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value.replace(/\D/g, "").slice(0, 9));
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      <div
        className={`flex h-[50px] items-center overflow-hidden rounded-xl border bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#DBEAFE] ${error ? "border-[#EF4444] focus-within:ring-[#EF4444]/20" : "border-[#E2E8F0]"}`}
      >
        <span className="flex shrink-0 items-center gap-1.5 border-r border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm font-bold text-[#94A3B8]">
          <span>🇬🇪</span>
          <span>+995</span>
        </span>
        <input
          type="tel"
          inputMode="numeric"
          value={formatPhone(value)}
          onChange={handleChange}
          placeholder="5XX XX XX XX"
          className="w-full bg-transparent px-4 py-3 text-sm font-bold outline-none placeholder:font-medium placeholder:text-[#94A3B8]/50"
        />
      </div>
      {error && <p className="text-xs text-[#EF4444]">{error}</p>}
    </div>
  );
}
