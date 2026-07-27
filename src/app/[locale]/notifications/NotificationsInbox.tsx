"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { ICON_STYLES, iconForType } from "@/lib/utils/notifications";
import type { Tables } from "@/lib/types/database";

type Notification = Tables<"notifications">;
const PAGE_SIZE = 50;

/** Authenticated aggregate inbox: every scoped and global row for this user. */
export default function NotificationsInbox({ userId }: { userId: string }) {
  const t = useTranslations("DashboardShared");
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", userId);
    if (tab === "unread") query = query.eq("is_read", false);
    const { data, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setItems(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, supabase, tab, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("aggregate-notifications-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [load, supabase, userId]);

  const unread = useMemo(() => items.filter((item) => !item.is_read).length, [items]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function markRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    void load();
  }

  function switchTab(next: "all" | "unread") {
    setPage(0);
    setTab(next);
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-black text-[#0F172A]">
          <Bell className="size-7 text-[#2563EB]" /> {t("notifTitle")}
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">{t("notifSubtitleSystem")}</p>
      </div>
      <section className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF1F4] px-5 py-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => switchTab("all")} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "all" ? "bg-[#0F172A] text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>
              {t("tabAll", { count: total })}
            </button>
            <button type="button" onClick={() => switchTab("unread")} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "unread" ? "bg-[#0F172A] text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>
              {t("tabUnread", { count: unread })}
            </button>
          </div>
          <button type="button" onClick={markAllRead} disabled={unread === 0} className="text-xs font-bold text-[#2563EB] disabled:text-[#CBD5E1]">
            {t("markAllRead")}
          </button>
        </div>
        {loading ? <div className="p-8 text-sm text-[#94A3B8]">…</div> : items.length === 0 ? (
          <div className="p-14 text-center text-sm text-[#94A3B8]">{t("noNotificationsYet")}</div>
        ) : (
          <ul className="divide-y divide-[#EEF1F4]">
            {items.map((item) => {
              const tone = ICON_STYLES[iconForType(item.type)];
              return <NotificationCard key={item.id} notification={item} tone={{ Icon: tone.Icon, bg: tone.bg, fg: tone.color }} onRead={markRead} />;
            })}
          </ul>
        )}
        {total > PAGE_SIZE && <div className="flex items-center justify-between border-t border-[#EEF1F4] px-5 py-3 text-sm">
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="inline-flex items-center gap-1 disabled:text-[#CBD5E1]"><ChevronLeft className="size-4" /> Previous</button>
          <span className="text-[#64748B]">{page + 1} / {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1} className="inline-flex items-center gap-1 disabled:text-[#CBD5E1]">Next <ChevronRight className="size-4" /></button>
        </div>}
      </section>
    </main>
  );
}
