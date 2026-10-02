"use client";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { useNotifications } from "@/lib/hooks/useNotifications";

interface DashboardNotificationBellProps {
  /** Server-seeded unread count shown until the client hook finishes loading. */
  initialUnreadCount?: number;
  /** Trigger styling so each topbar keeps its own button design. */
  triggerClassName?: string;
}

/**
 * Header bell popover for every dashboard topbar. It is the unified,
 * all-cabinet bell: every notification the signed-in user owns, from every
 * role they hold plus global notices, each row labelled with its cabinet.
 * "View all" opens the aggregate /notifications inbox; the per-cabinet inboxes
 * and sidebar badges stay scoped. Inside DashboardShell the hook shares the
 * shell's single subscription; mount it ONCE per topbar, since a second
 * instance would open another channel named "notifications".
 */
export function DashboardNotificationBell({
  initialUnreadCount = 0,
  triggerClassName,
}: DashboardNotificationBellProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllRead } =
    useNotifications();

  return (
    <NotificationBell
      notifications={notifications}
      unreadCount={loading ? initialUnreadCount : unreadCount}
      loading={loading}
      markAsRead={markAsRead}
      markAllRead={markAllRead}
      viewAllPath="/notifications"
      triggerClassName={triggerClassName}
      testId="header-bell"
    />
  );
}
