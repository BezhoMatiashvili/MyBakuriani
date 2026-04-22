"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Info,
  Star,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";

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
    verification: { icon: Info, bg: "bg-[#DBEAFE]", fg: "text-[#2563EB]" },
    favorite: { icon: Star, bg: "bg-[#FEF3C7]", fg: "text-[#D97706]" },
    balance_low: {
      icon: AlertTriangle,
      bg: "bg-[#FFEDD5]",
      fg: "text-[#F97316]",
    },
    inquiry: {
      icon: MessageSquare,
      bg: "bg-[#DCFCE7]",
      fg: "text-[#16A34A]",
    },
    promotion: {
      icon: Megaphone,
      bg: "bg-[#FFEDD5]",
      fg: "text-[#F97316]",
    },
    default: { icon: Bell, bg: "bg-[#F1F5F9]", fg: "text-[#64748B]" },
  };

function relativeTimeKa(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) {
    const mins = Math.floor(diffMs / 60_000);
    return mins < 1 ? "ახლა" : `${mins} წთ-ის წინ`;
  }
  if (hours < 24) return `${hours} სთ-ის წინ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "გუშინ";
  return `${days} დღის წინ`;
}

export default function ServiceNotificationsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[]);
        setLoading(false);
      });
  }, [user, supabase]);

  const unread = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications;

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
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          შეტყობინებები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მოთხოვნები, აქციები და სისტემური ცნობები.
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[
            { key: "all" as const, label: `ყველა (${notifications.length})` },
            { key: "unread" as const, label: `წაუკითხავი (${unread})` },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                filter === t.key
                  ? "bg-[#0F172A] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0F172A] hover:text-[#0F172A]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unread === 0}
          className="text-[12px] font-bold text-[#2563EB] hover:underline disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:no-underline"
        >
          ყველას ნაკითხულად მონიშვნა
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
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
          ) : filtered.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-[#CBD5E1]" />
              <p className="mt-3 text-[13px] font-semibold text-[#0F172A]">
                ცარიელია
              </p>
              <p className="mt-1 text-[12px] text-[#94A3B8]">
                შეტყობინებები ჯერ არ არის
              </p>
            </li>
          ) : (
            filtered.map((n) => {
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
                        {relativeTimeKa(n.created_at)}
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
