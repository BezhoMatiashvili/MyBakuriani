"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export function useNotifications() {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch existing notifications
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setNotifications(data ?? []);
      setLoading(false);

      // Subscribe to real-time changes
      channel = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const newNotification = payload.new as Notification;
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
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const deleted = payload.old as Notification;
            setNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
          },
        )
        .subscribe();
    }

    init();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAsRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    if (error) throw error;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  }

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
  };
}
