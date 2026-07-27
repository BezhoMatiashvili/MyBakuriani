"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  const [loading, setLoading] = useState(true);
  // The read-writes below run outside the effect that resolves the session, so
  // the id is parked here to carry an explicit user_id predicate. That predicate
  // is load-bearing: the "Admins full access notifications" policy is FOR ALL and
  // ORs with the per-user one, so an UPDATE without it rewrites EVERY user's rows
  // whenever an admin is the one clicking.
  const userIdRef = useRef<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

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
        // recent items, and realtime keeps newer ones in sync).
        let query = supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (scope) query = query.eq("dashboard_scope", scope);
        const { data } = await query;

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
    };
  }, [scope, supabase]);

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
  }

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
  };
}
