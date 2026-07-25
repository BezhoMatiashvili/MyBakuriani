"use client";

import { ReactNode, useMemo } from "react";
import {
  CalendarCheck,
  CalendarX,
  Briefcase,
  Sun,
  CalendarClock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  isWeekend,
  parseIsoDate,
  buildNextNDays,
} from "@/lib/utils/availability";

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
  /** Blocks every action while the caller's write is in flight. */
  pending?: boolean;
}

interface Action {
  key: string;
  labelKey:
    | "allAvailable"
    | "allBlocked"
    | "weekdaysOnly"
    | "weekendsOnly"
    | "blockNext7";
  icon: ReactNode;
  compute: (dates: string[]) => BulkApplyChanges;
}

const ACTION_DEFS: Omit<Action, "labelKey">[] = [
  {
    key: "all-available",
    icon: <CalendarCheck className="size-4" />,
    compute: (dates) => ({ available: [...dates], blocked: [] }),
  },
  {
    key: "all-blocked",
    icon: <CalendarX className="size-4" />,
    compute: (dates) => ({ available: [], blocked: [...dates] }),
  },
  {
    key: "weekdays-only",
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
    icon: <CalendarClock className="size-4" />,
    // Deliberately NOT intersected with the window: this action means "the next
    // 7 days", not "whichever of them fall inside the month you're looking at".
    // Intersecting made it a silent no-op on every month except the current one.
    compute: () => ({ available: [], blocked: buildNextNDays(7) }),
  },
];

const LABEL_KEYS: Action["labelKey"][] = [
  "allAvailable",
  "allBlocked",
  "weekdaysOnly",
  "weekendsOnly",
  "blockNext7",
];

export default function BulkActionBar({
  windowDates,
  onApply,
  skipDates,
  pending = false,
}: BulkActionBarProps) {
  const t = useTranslations("BulkActionBar");

  const actions = useMemo(
    () =>
      ACTION_DEFS.map((def, i) => ({
        ...def,
        label: t(LABEL_KEYS[i]),
      })),
    [t],
  );

  const handleClick = (action: (typeof actions)[number]) => {
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
        {t("quickSelect")}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => handleClick(action)}
            disabled={pending}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#2563EB] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#E2E8F0] disabled:hover:bg-white disabled:hover:text-[#0F172A]"
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
