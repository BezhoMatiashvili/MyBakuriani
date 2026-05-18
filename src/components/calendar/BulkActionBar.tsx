"use client";

import { ReactNode } from "react";
import {
  CalendarCheck,
  CalendarX,
  Briefcase,
  Sun,
  CalendarClock,
} from "lucide-react";
import { isWeekend, parseIsoDate } from "@/lib/utils/availability";

/**
 * Bulk action result: which dates should become available vs. blocked.
 * Caller persists however it likes (wizard updates a Map; dashboard
 * dispatches turnOnDays / turnOffDays).
 */
export interface BulkApplyChanges {
  available: string[];
  blocked: string[];
}

interface BulkActionBarProps {
  /** ISO dates the bar's actions operate on (window-scoped). */
  windowDates: string[];
  onApply: (changes: BulkApplyChanges) => void;
  /** Dates the bar must never touch (e.g., already-booked days). */
  skipDates?: ReadonlySet<string>;
}

interface Action {
  key: string;
  label: string;
  icon: ReactNode;
  compute: (dates: string[]) => BulkApplyChanges;
}

const ACTIONS: Action[] = [
  {
    key: "all-available",
    label: "მთელი თვე ხელმისაწვდომი",
    icon: <CalendarCheck className="size-4" />,
    compute: (dates) => ({ available: [...dates], blocked: [] }),
  },
  {
    key: "all-blocked",
    label: "მთელი თვე დაკავებული",
    icon: <CalendarX className="size-4" />,
    compute: (dates) => ({ available: [], blocked: [...dates] }),
  },
  {
    key: "weekdays-only",
    label: "მხოლოდ სამუშაო დღეები",
    icon: <Briefcase className="size-4" />,
    compute: (dates) => {
      const available: string[] = [];
      const blocked: string[] = [];
      for (const iso of dates) {
        if (isWeekend(parseIsoDate(iso))) blocked.push(iso);
        else available.push(iso);
      }
      return { available, blocked };
    },
  },
  {
    key: "weekends-only",
    label: "მხოლოდ შაბათ-კვირა",
    icon: <Sun className="size-4" />,
    compute: (dates) => {
      const available: string[] = [];
      const blocked: string[] = [];
      for (const iso of dates) {
        if (isWeekend(parseIsoDate(iso))) available.push(iso);
        else blocked.push(iso);
      }
      return { available, blocked };
    },
  },
  {
    key: "block-next-7",
    label: "შემდეგი 7 დღე დაკავებული",
    icon: <CalendarClock className="size-4" />,
    compute: (dates) => ({ available: [], blocked: dates.slice(0, 7) }),
  },
];

export default function BulkActionBar({
  windowDates,
  onApply,
  skipDates,
}: BulkActionBarProps) {
  const handleClick = (action: Action) => {
    const result = action.compute(windowDates);
    if (skipDates && skipDates.size > 0) {
      result.available = result.available.filter((d) => !skipDates.has(d));
      result.blocked = result.blocked.filter((d) => !skipDates.has(d));
    }
    onApply(result);
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
        სწრაფი მონიშვნა
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => handleClick(action)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] active:scale-[0.98]"
          >
            <span className="shrink-0 text-[#2563EB]">{action.icon}</span>
            <span className="line-clamp-2 text-left leading-tight">
              {action.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
