"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Database } from "@/lib/types/database";

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

/**
 * The live per-scope notification state DashboardShell already keeps warm via
 * its own "dashboard-notifications" subscription (see DashboardShell.tsx),
 * exposed to descendants so useNotifications() can skip opening a second,
 * redundant realtime channel + count query for roles whose topbar bell
 * (DashboardNotificationBell) renders inside DashboardShell — guest, cleaner,
 * admin. Null outside those branches (e.g. the public Navbar's bell), in
 * which case useNotifications() falls back to fetching/subscribing on its own.
 */
export interface DashboardNotificationsFeed {
  /** Exact unread count for the active dashboard scope. */
  unreadCount: number;
  /**
   * INSERT/UPDATE rows DashboardShell's subscription has seen since mount
   * (bounded to the most recent ~50, same cap as the bell's own list query).
   * A growing array rather than a single "last event" slot: two rows can land
   * in the same React batch (e.g. the smart-match fan-out sends one
   * notification per owner per request), which would otherwise collapse to
   * just the final one. Consumers fold over the whole array on each change —
   * safe because merging an already-applied row is a no-op (INSERT dedupes by
   * id, UPDATE is a replace-by-id).
   */
  events: { eventType: "INSERT" | "UPDATE"; row: NotificationRow }[];
  /** Optimistically adjust the shared count (e.g. -1 right after marking one notification read) so the badge doesn't wait on DashboardShell's own debounced recount. */
  adjustUnreadCount: (delta: number) => void;
  /** Optimistically zero the shared count (mark-all-read). */
  resetUnreadCount: () => void;
}

const DashboardNotificationsContext =
  createContext<DashboardNotificationsFeed | null>(null);

export function DashboardNotificationsFeedProvider({
  value,
  children,
}: {
  value: DashboardNotificationsFeed;
  children: ReactNode;
}) {
  return (
    <DashboardNotificationsContext.Provider value={value}>
      {children}
    </DashboardNotificationsContext.Provider>
  );
}

export function useDashboardNotificationsFeed(): DashboardNotificationsFeed | null {
  return useContext(DashboardNotificationsContext);
}
