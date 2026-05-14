"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Info, Star, AlertTriangle, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type DBNotification = Tables<"notifications">;

const ICON_STYLES = {
  info: {
    bg: "bg-[#DBEAFE]",
    color: "text-[#2563EB]",
    Icon: Info,
  },
  star: {
    bg: "bg-[#FEF3C7]",
    color: "text-[#F59E0B]",
    Icon: Star,
  },
  warning: {
    bg: "bg-[#FFEDD5]",
    color: "text-[#F97316]",
    Icon: AlertTriangle,
  },
  lead: {
    bg: "bg-[#DCFCE7]",
    color: "text-[#16A34A]",
    Icon: BellRing,
  },
} as const;

type IconKey = keyof typeof ICON_STYLES;

function iconForType(type: string): IconKey {
  switch (type) {
    case "smart_match_request":
    case "smart_match":
      return "lead";
    case "smart_match_offer":
      return "info";
    case "warning":
    case "balance_low":
      return "warning";
    case "favorite":
    case "review":
    case "review_request":
      return "star";
    default:
      return "info";
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "ახლახან";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "ახლახან";
  if (hours < 24) return `${hours} სთ-ის წინ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "გუშინ";
  return `${days} დღის წინ`;
}

export default function RenterNotificationsPage() {
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
          filter: `user_id=eq.${user.id}`,
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
      .eq("is_read", false);
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="flex items-center gap-3 text-[36px] font-black leading-[44px] text-[#0F172A]">
          <Bell className="h-8 w-8 text-[#2563EB]" fill="#2563EB" />
          შეტყობინებები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          სისტემური შეტყობინებები და მნიშვნელოვანი სიახლეები.
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
            ბოლო 30 დღე
          </span>
          <button
            type="button"
            onClick={markAllRead}
            className="text-[12px] font-bold text-[#2563EB] hover:underline"
          >
            ყველას ნაკითხულად მონიშვნა
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
              ჯერ არ გაქვთ შეტყობინებები
            </p>
          </div>
        ) : (
          <ul>
            {items.map((item, i) => {
              const iconKey = iconForType(item.type);
              const style = ICON_STYLES[iconKey];
              const IconCmp = style.Icon;
              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-4 px-6 py-5 ${
                    item.is_read ? "" : "bg-[#F8FAFC]"
                  } ${i === items.length - 1 ? "" : "border-b border-[#EEF1F4]"}`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${style.bg}`}
                  >
                    <IconCmp
                      className={`h-5 w-5 ${style.color}`}
                      strokeWidth={2.2}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-extrabold text-[#0F172A]">
                      {item.title}
                    </p>
                    {item.message && (
                      <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
                        {item.message}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                    {relativeTime(item.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>
    </div>
  );
}
