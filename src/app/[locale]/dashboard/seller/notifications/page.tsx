"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Bell,
  Info,
  Star,
  AlertTriangle,
  ConciergeBell,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRealtimeList } from "@/lib/hooks/useRealtime";
import { formatRelativeTime } from "@/lib/i18n/relativeTime";

interface Notification {
  id: string;
  type: string | null;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

const TYPE_ICON: Record<string, { icon: LucideIcon; bg: string; fg: string }> =
  {
    verification: {
      icon: Info,
      bg: "bg-[#DBEAFE]",
      fg: "text-[#2563EB]",
    },
    favorite: {
      icon: Star,
      bg: "bg-[#FEF3C7]",
      fg: "text-[#D97706]",
    },
    balance_low: {
      icon: AlertTriangle,
      bg: "bg-[#FFEDD5]",
      fg: "text-[#F97316]",
    },
    lead: {
      icon: ConciergeBell,
      bg: "bg-[#DCFCE7]",
      fg: "text-[#16A34A]",
    },
    default: {
      icon: Bell,
      bg: "bg-[#F1F5F9]",
      fg: "text-[#64748B]",
    },
  };

export default function SellerNotificationsPage() {
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();

  const {
    rows: notifications,
    setRows: setNotifications,
    loading,
  } = useRealtimeList<Notification>({
    table: "notifications",
    enabled: !!user,
    filter: user ? `user_id=eq.${user.id}` : undefined,
    fetcher: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .order("created_at", { ascending: false });
      return (data ?? []) as Notification[];
    },
  });

  const unread = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  async function markAllRead() {
    if (!user || unread === 0) return;
    setNotifications((prev) =>
      prev.map((n) => (n.is_read ? n : { ...n, is_read: true })),
    );
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
        className="flex items-end gap-3"
      >
        <Bell className="mb-1 h-6 w-6 text-[#2563EB]" />
        <div>
          <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
            {tShared("notifTitle")}
          </h1>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            {tShared("notifSubtitleSystem")}
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="flex items-center justify-between border-b border-[#EEF1F4] px-6 py-4">
          <p className="text-[12px] font-bold text-[#0F172A]">
            {tShared("last30Days")}
          </p>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="text-[12px] font-bold text-[#2563EB] hover:underline disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:no-underline"
          >
            {tShared("markAllReadAlt")}
          </button>
        </div>

        <ul className="divide-y divide-[#EEF1F4]">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-start gap-4 px-6 py-5">
                <div className="h-10 w-10 animate-pulse rounded-full bg-[#F1F5F9]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 animate-pulse rounded bg-[#F1F5F9]" />
                  <div className="h-3 w-full animate-pulse rounded bg-[#F1F5F9]" />
                </div>
              </li>
            ))
          ) : notifications.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-[#CBD5E1]" />
              <p className="mt-3 text-[13px] font-semibold text-[#0F172A]">
                {tShared("empty")}
              </p>
              <p className="mt-1 text-[12px] text-[#94A3B8]">
                {tShared("emptyLast30Days")}
              </p>
            </li>
          ) : (
            notifications.map((n) => {
              const tone = TYPE_ICON[n.type ?? "default"] ?? TYPE_ICON.default;
              const Icon = tone.icon;
              return (
                <li
                  key={n.id}
                  className={`flex items-start gap-4 px-6 py-5 transition-colors ${
                    n.is_read ? "" : "bg-[#F8FAFF]"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.bg}`}
                  >
                    <Icon className={`h-5 w-5 ${tone.fg}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-black text-[#0F172A]">
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-[#94A3B8]">
                        {formatRelativeTime(tShared, n.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-[18px] text-[#64748B]">
                      {n.message}
                    </p>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </motion.div>
    </div>
  );
}
