"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { ICON_STYLES, iconForType } from "@/lib/utils/notifications";
import type { Tables } from "@/lib/types/database";

type DBNotification = Tables<"notifications">;

export default function RenterNotificationsPage() {
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();
  const [items, setItems] = useState<DBNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function fetchItems() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .eq("dashboard_scope", "renter")
        .order("created_at", { ascending: false })
        .limit(30);
      if (data && active) {
        setItems(data);
        setLoading(false);
      } else if (active) {
        setLoading(false);
      }
    }

    fetchItems();

    const channel = supabase
      .channel("renter-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "dashboard_scope=eq.renter",
        },
        () => {
          fetchItems();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function markAllRead() {
    if (!user) return;
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .eq("dashboard_scope", "renter");
  }

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)),
    );
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="flex items-center gap-3 text-[36px] font-black leading-[44px] text-[#0F172A]">
          <Bell className="h-8 w-8 text-[#2563EB]" fill="#2563EB" />
          {tShared("notifTitle")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {tShared("notifSubtitleSystem")}
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        <div className="flex items-center justify-between border-b border-[#EEF1F4] px-6 py-4">
          <span className="text-[13px] font-semibold text-[#94A3B8]">
            {tShared("last30Days")}
          </span>
          <button
            type="button"
            onClick={markAllRead}
            className="text-[12px] font-bold text-[#2563EB] hover:underline"
          >
            {tShared("markAllRead")}
          </button>
        </div>

        {loading ? (
          <div className="space-y-3 px-6 py-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-sm text-[#94A3B8]">
              {tShared("noNotificationsYet")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#EEF1F4]">
            {items.map((item) => {
              const style = ICON_STYLES[iconForType(item.type ?? "")];
              return (
                <NotificationCard
                  key={item.id}
                  notification={item}
                  tone={{ Icon: style.Icon, bg: style.bg, fg: style.color }}
                  onRead={markRead}
                />
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
