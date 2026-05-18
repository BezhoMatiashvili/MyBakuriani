"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  ICON_STYLES,
  iconForType,
  relativeTime,
} from "@/lib/utils/notifications";
import type { Database } from "@/lib/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  viewAllPath: string;
  variant?: "desktop" | "mobile";
}

export function NotificationBell({
  notifications,
  unreadCount,
  loading,
  markAsRead,
  viewAllPath,
  variant = "desktop",
}: NotificationBellProps) {
  const t = useTranslations("Navbar");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const items = notifications.slice(0, 8);
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  async function markAllRead() {
    if (!user) return;
    const supabase = createClient();
    const unread = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length === 0) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    await Promise.all(
      unread.map((id) =>
        markAsRead(id).catch(() => {
          /* state sync handled by realtime */
        }),
      ),
    );
  }

  function handleItemClick(id: string, isRead: boolean) {
    if (!isRead) {
      void markAsRead(id).catch(() => {});
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("notificationsAria", { count: unreadCount })}
        className={
          variant === "mobile"
            ? "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#334155] transition-colors hover:bg-[#F1F5F9]"
            : "relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#DBEAFE] bg-[#F8FAFC] text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
        }
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_white]"
          >
            {badge}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-2rem)] max-w-[380px] gap-0 p-0"
      >
        <div className="flex items-center justify-between border-b border-[#EEF1F4] px-4 py-3">
          <span className="text-[14px] font-extrabold text-[#0F172A]">
            {t("notifications")}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[11px] font-bold text-[#2563EB] hover:underline"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <Bell className="h-8 w-8 text-[#CBD5E1]" aria-hidden />
            <p className="mt-2 text-[13px] text-[#94A3B8]">
              {t("noNotifications")}
            </p>
          </div>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto">
            {items.map((item, i) => {
              const style = ICON_STYLES[iconForType(item.type)];
              const IconCmp = style.Icon;
              const isLast = i === items.length - 1;
              const baseRow = `flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F1F5F9] ${
                item.is_read ? "" : "bg-[#F8FAFC]"
              } ${isLast ? "" : "border-b border-[#EEF1F4]"}`;
              const content = (
                <>
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.bg}`}
                  >
                    <IconCmp
                      className={`h-4 w-4 ${style.color}`}
                      strokeWidth={2.2}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#0F172A]">
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-[18px] text-[#64748B]">
                        {item.message}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-[#94A3B8]">
                    {relativeTime(item.created_at)}
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {item.action_url ? (
                    <Link
                      href={item.action_url as never}
                      onClick={() => handleItemClick(item.id, !!item.is_read)}
                      className={baseRow}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleItemClick(item.id, !!item.is_read)}
                      className={baseRow}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-[#EEF1F4] px-4 py-2.5">
          <Link
            href={viewAllPath as never}
            onClick={() => setOpen(false)}
            className="block text-center text-[12px] font-bold text-[#2563EB] hover:underline"
          >
            {t("viewAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
