"use client";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { useNotifications } from "@/lib/hooks/useNotifications";
import type { DashboardScope } from "@/lib/notifications/scopes";

interface DashboardNotificationBellProps {
  /** Server-seeded unread count shown until the client hook finishes loading. */
  initialUnreadCount?: number;
  /** Trigger styling so each topbar keeps its own button design. */
  triggerClassName?: string;
  scope: DashboardScope;
}

/**
 * Bell popover for dashboard topbars (guest/cleaner/admin) — roles without a
 * dedicated notifications page, hence no viewAllPath. Reuses the Navbar's
 * "notifications" channel name; safe because LocaleShell never renders the
 * Navbar on /dashboard routes, so the two never mount together.
 */
export function DashboardNotificationBell({
  initialUnreadCount = 0,
  triggerClassName,
  scope,
}: DashboardNotificationBellProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllRead } =
    useNotifications(scope);

  return (
    <NotificationBell
      notifications={notifications}
      unreadCount={loading ? initialUnreadCount : unreadCount}
      loading={loading}
      markAsRead={markAsRead}
      markAllRead={markAllRead}
      triggerClassName={triggerClassName}
    />
  );
}
