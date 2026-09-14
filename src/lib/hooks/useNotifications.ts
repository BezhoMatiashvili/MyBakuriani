"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import type { DashboardScope } from "@/lib/notifications/scopes";
import { useDashboardNotificationsFeed } from "@/lib/dashboard/notificationsFeed";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

/**
 * Global bell when scope is omitted; an exact cabinet feed/bell otherwise.
 * Global notifications are intentionally not included in a scoped result.
 */
export function useNotifications(scope?: DashboardScope) {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Null outside DashboardShell's guest/cleaner/admin branches (e.g. the public
  // Navbar's bell), in which case this hook fetches/subscribes on its own,
  // exactly as before. Read via a ref inside init() below so the object
  // changing on every notification (its unreadCount/events are live) never
  // re-triggers that effect — only its one-time presence matters there.
  const externalFeed = useDashboardNotificationsFeed();
  const externalFeedRef = useRef(externalFeed);
  externalFeedRef.current = externalFeed;
  // The read-writes below run outside the effect that resolves the session, so
  // the id is parked here to carry an explicit user_id predicate. That predicate
  // is load-bearing: the "Admins full access notifications" policy is FOR ALL and
  // ORs with the per-user one, so an UPDATE without it rewrites EVERY user's rows
  // whenever an admin is the one clicking.
  const userIdRef = useRef<string | null>(null);
  // Debounces the UPDATE/DELETE recount below, mirroring
  // DashboardShell.tsx's recountUnread — a burst of realtime events collapses
  // into one query instead of one per event.
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The single source of truth for the badge number: an exact count query,
  // never a filter over the capped 50-row list below. That list mixes
  // read+unread and drops anything past 50, so deriving the count from it
  // silently under-reports once a user has 50+ notifications (see contracts.md C7).
  const fetchUnreadCount = useCallback(
    async (userId: string) => {
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (scope) query = query.eq("dashboard_scope", scope);
      const { count, error } = await query;
      if (!error) setUnreadCount(count ?? 0);
    },
    [supabase, scope],
  );

  const recountUnread = useCallback(() => {
    const userId = userIdRef.current;
    if (!userId) return;
    if (recountTimer.current) clearTimeout(recountTimer.current);
    recountTimer.current = setTimeout(() => {
      fetchUnreadCount(userId);
    }, 400);
  }, [fetchUnreadCount]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      setLoading(true);
      try {
        // getSession reads the cookie locally (no Auth round-trip). The query is
        // RLS-scoped to the user, so a stale/forged session can't widen access.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        userIdRef.current = user.id;

        // Fetch existing notifications (cap the initial load — the bell only shows
        // recent items, and realtime keeps newer ones in sync) alongside the exact
        // unread count (a separate concern — see fetchUnreadCount above). When a
        // DashboardNotificationsFeed is available, that count is already being
        // kept warm by DashboardShell's own subscription — skip the redundant
        // query here (the merge effect below keeps the list in sync instead of
        // this hook's own channel).
        let query = supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (scope) query = query.eq("dashboard_scope", scope);
        const hasExternalFeed = !!externalFeedRef.current;
        const { data } = hasExternalFeed
          ? await query
          : (await Promise.all([query, fetchUnreadCount(user.id)]))[0];

        setNotifications(data ?? []);

        if (hasExternalFeed) return;

        // Subscribe to real-time changes
        channel = supabase
          .channel("notifications")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              // Always the per-user filter, never the scope: Realtime supports one
              // filter, and `dashboard_scope=eq.…` would drop the user predicate.
              // For an admin viewer the "Admins full access" RLS policy then lets
              // every other user's notification through into this feed. The scope
              // is applied client-side in the handler instead.
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const newNotification = payload.new as Notification;
              if (scope && newNotification.dashboard_scope !== scope) return;
              setNotifications((prev) => {
                if (prev.some((item) => item.id === newNotification.id)) {
                  return prev;
                }
                return [newNotification, ...prev];
              });
              // An INSERT is unambiguously unread — no need to round-trip for
              // the count.
              setUnreadCount((c) => c + 1);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "notifications",
              // Always the per-user filter, never the scope: Realtime supports one
              // filter, and `dashboard_scope=eq.…` would drop the user predicate.
              // For an admin viewer the "Admins full access" RLS policy then lets
              // every other user's notification through into this feed. The scope
              // is applied client-side in the handler instead.
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const updated = payload.new as Notification;
              setNotifications((prev) =>
                prev.map((n) => (n.id === updated.id ? updated : n)),
              );
              // Can't tell locally whether this flipped read/unread (the row
              // may not even be in the capped list above) — recount instead
              // of guessing.
              recountUnread();
            },
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "notifications",
              // Always the per-user filter, never the scope: Realtime supports one
              // filter, and `dashboard_scope=eq.…` would drop the user predicate.
              // For an admin viewer the "Admins full access" RLS policy then lets
              // every other user's notification through into this feed. The scope
              // is applied client-side in the handler instead.
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              const deleted = payload.old as Notification;
              setNotifications((prev) =>
                prev.filter((n) => n.id !== deleted.id),
              );
              // A filtered DELETE's payload carries only the primary key
              // (contracts.md C7) — whether the deleted row was read or
              // unread is unknowable here, so recount rather than guess.
              recountUnread();
            },
          )
          .subscribe();
      } catch {
        // On failure the bell just shows empty — never leave it spinning.
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (recountTimer.current) clearTimeout(recountTimer.current);
    };
  }, [scope, supabase, fetchUnreadCount, recountUnread]);

  // Stands in for this hook's own channel (skipped above) when a
  // DashboardNotificationsFeed is available: DashboardShell already sees every
  // INSERT/UPDATE for this user on its own subscription, so merge each one in
  // here instead of opening a second one. Re-folds the whole (bounded) array
  // on every change rather than tracking "the last one merged" — harmless,
  // since merging an already-applied row is a no-op (INSERT dedupes by id,
  // UPDATE is a replace-by-id). DELETE isn't covered — a filtered DELETE
  // subscription never receives events under RLS (see contracts.md C7 /
  // memory-bank), so the dropped hook's own DELETE handler was already dead
  // code in practice.
  useEffect(() => {
    const events = externalFeed?.events;
    if (!events) return;
    for (const { eventType, row } of events) {
      if (scope && row.dashboard_scope !== scope) continue;
      if (eventType === "INSERT") {
        setNotifications((prev) => {
          if (prev.some((item) => item.id === row.id)) return prev;
          return [row, ...prev];
        });
      } else {
        setNotifications((prev) =>
          prev.map((n) => (n.id === row.id ? row : n)),
        );
      }
    }
  }, [externalFeed?.events, scope]);

  async function markAsRead(id: string) {
    const wasUnread = notifications.find((n) => n.id === id)?.is_read === false;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userIdRef.current ?? "");

    if (error) throw error;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    if (externalFeed) {
      // DashboardShell's own subscription will also recount this write, but
      // only after a round-trip through its debounce — decrement now (only if
      // this row was actually unread) so the badge doesn't visibly lag.
      if (wasUnread) externalFeed.adjustUnreadCount(-1);
    } else {
      // Same call this row's own realtime UPDATE would trigger — recounting
      // here too means the badge doesn't wait on the round-trip.
      recountUnread();
    }
  }

  /**
   * Bulk read for exactly this hook's feed — the signed-in user, plus the scope
   * when one is set. It lives here rather than in the bell because this is the
   * only place that already knows who the user is; without that predicate an
   * admin clicking "mark all read" on the unscoped navbar bell marks the ENTIRE
   * notifications table read.
   */
  async function markAllRead() {
    const userId = userIdRef.current;
    if (!userId) return;
    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (scope) query = query.eq("dashboard_scope", scope);
    const { error } = await query;

    if (error) throw error;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    // The write above touched exactly this feed's unread rows (same
    // user_id/scope predicate), so the new count is known outright — no
    // need to round-trip for it.
    if (externalFeed) {
      externalFeed.resetUnreadCount();
    } else {
      setUnreadCount(0);
    }
  }

  return {
    notifications,
    unreadCount: externalFeed ? externalFeed.unreadCount : unreadCount,
    loading,
    markAsRead,
    markAllRead,
  };
}
