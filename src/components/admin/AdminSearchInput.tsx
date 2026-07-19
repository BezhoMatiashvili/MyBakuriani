"use client";

import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  loading?: boolean;
  onClear?: () => void;
};

export function AdminSearchInput({
  value,
  onChange,
  placeholder,
  className,
  loading = false,
  onClear,
}: AdminSearchInputProps) {
  const showClear = Boolean(onClear) && value.length > 0;

  return (
    <div className={cn("relative max-w-[420px]", className)}>
      {loading ? (
        <Loader2 className="absolute left-4 top-1/2 h-[14px] w-[14px] -translate-y-1/2 animate-spin text-[#94A3B8]" />
      ) : (
        <Search className="absolute left-4 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#94A3B8]" />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-[42px] w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-4 text-[13px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10",
          showClear && "pr-9",
        )}
      />
      {showClear ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full text-[#94A3B8] hover:text-[#475569]"
        >
          <X className="h-[14px] w-[14px]" />
        </button>
      ) : null}
    </div>
  );
}
