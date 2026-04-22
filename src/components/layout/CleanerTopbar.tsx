"use client";

import { Bell } from "lucide-react";

interface CleanerTopbarProps {
  notificationCount?: number;
  available: boolean;
  onAvailableChange?: (v: boolean) => void;
}

export function CleanerTopbar({
  notificationCount = 0,
  available,
  onAvailableChange,
}: CleanerTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-5 py-4 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] sm:px-10">
      <div className="flex w-full items-center justify-end gap-3">
        <button
          type="button"
          className="relative flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#0F172A] transition-colors hover:border-[#CBD5E1]"
          aria-label="notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={available}
          onClick={() => onAvailableChange?.(!available)}
          className="flex h-[44px] items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 text-[12px] font-bold text-[#0F172A] transition-colors"
        >
          <span
            className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
            style={{ backgroundColor: available ? "#10B981" : "#E2E8F0" }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{
                transform: available ? "translateX(18px)" : "translateX(2px)",
              }}
            />
          </span>
          <span className={available ? "text-[#10B981]" : "text-[#64748B]"}>
            {available ? "ონლაინ" : "ოფლაინ"}
          </span>
        </button>
      </div>
    </header>
  );
}
