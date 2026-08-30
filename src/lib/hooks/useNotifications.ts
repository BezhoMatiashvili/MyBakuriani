"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import type { DashboardScope } from "@/lib/notifications/scopes";

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
        // unread count (a separate concern — see fetchUnreadCount above).
        let query = supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (scope) query = query.eq("dashboard_scope", scope);
        const [{ data }] = await Promise.all([
          query,
          fetchUnreadCount(user.id),
        ]);

        setNotifications(data ?? []);

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

  async function markAsRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userIdRef.current ?? "");

    if (error) throw error;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    // Same call this row's own realtime UPDATE would trigger — recounting
    // here too means the badge doesn't wait on the round-trip.
    recountUnread();
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
    setUnreadCount(0);
  }

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
  };
}
