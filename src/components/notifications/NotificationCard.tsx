"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { safeInternalPath } from "@/lib/security";
import { formatRelativeTime } from "@/lib/i18n/relativeTime";

export interface NotificationCardItem {
  id: string;
  type: string | null;
  title: string;
  message: string | null;
  is_read: boolean | null;
  action_url: string | null;
  created_at: string | null;
}

interface NotificationCardProps {
  notification: NotificationCardItem;
  /** Icon + colors resolved by the page so each role keeps its own iconography. */
  tone: { Icon: LucideIcon; bg: string; fg: string };
  /** Marks the notification read (optimistic + DB) when it is first expanded. */
  onRead: (id: string) => void;
  className?: string;
}

/** Absolute, human date for the expanded detail (e.g. "26 ივნ. 2026, 00:31"). */
function formatExactDate(createdAt: string | null): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ka-GE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A single notification rendered as an inline accordion: collapsed it shows the
 * title + a clamped message preview; clicking expands it in place to reveal the
 * full message, the exact date and (when present) a link to the related page.
 * Expanding an unread notification marks it read — mirroring the topbar bell.
 */
export function NotificationCard({
  notification: n,
  tone,
  onRead,
  className,
}: NotificationCardProps) {
  const tShared = useTranslations("DashboardShared");
  const [expanded, setExpanded] = useState(false);
  const { Icon } = tone;
  const actionPath = safeInternalPath(n.action_url);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      if (next && !n.is_read) onRead(n.id);
      return next;
    });
  }

  return (
    <li
      className={cn(
        "transition-colors",
        !n.is_read && "bg-[#F8FAFF]",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-4 px-6 py-5 text-left"
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            tone.bg,
          )}
        >
          <Icon
            className={cn("h-5 w-5", tone.fg)}
            strokeWidth={2.2}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="text-[14px] font-black text-[#0F172A]">
              {n.title}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-[#94A3B8]">
                {formatRelativeTime(tShared, n.created_at)}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 text-[#94A3B8] transition-transform duration-200",
                  expanded && "rotate-180",
                )}
              />
            </span>
          </span>
          {!expanded && n.message && (
            <span className="mt-1 line-clamp-2 block text-[12px] leading-[18px] text-[#64748B]">
              {n.message}
            </span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pb-5 pl-20 pr-6">
              {n.message && (
                <p className="whitespace-pre-line text-[13px] leading-[21px] text-[#475569]">
                  {n.message}
                </p>
              )}
              {n.created_at && (
                <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">
                  {formatExactDate(n.created_at)}
                </p>
              )}
              {actionPath && (
                <Link
                  href={actionPath as never}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  {tShared("viewNotification")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
