"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { Database } from "@/lib/types/database";
import type { DashboardScope } from "@/lib/notifications/scopes";

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

/**
 * The live notification state DashboardShell already keeps warm via its own
 * "dashboard-notifications" subscription (see DashboardShell.tsx), exposed to
 * descendants so useNotifications() can skip opening a second, redundant
 * realtime channel + count query for the header bell every dashboard topbar
 * renders inside DashboardShell. Null outside the shell (e.g. the public
 * Navbar's bell), in which case useNotifications() falls back to
 * fetching/subscribing on its own.
 */
export interface DashboardNotificationsFeed {
  /**
   * Exact unread count across EVERY scope, global (NULL-scope) notices
   * included — what the header bell shows. The per-cabinet counts that drive
   * the sidebar badges stay inside DashboardShell and are not exposed here.
   */
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
  /**
   * Optimistically adjust the shared counts (e.g. -1 right after marking one
   * notification read) so the badge doesn't wait on DashboardShell's own
   * debounced recount. The total always moves; the row's cabinet badge moves
   * only when `rowScope` is a cabinet (a global NULL-scope notice has none).
   */
  adjustUnreadCount: (delta: number, rowScope?: DashboardScope | null) => void;
  /** Optimistically zero the total and every cabinet badge (mark-all-read). */
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
