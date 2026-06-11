"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type CriticalNotification = {
  id: string;
  title: string;
  message: string | null;
  action_url: string | null;
  created_at: string | null;
};

export function CriticalNotificationGate() {
  const t = useTranslations("CriticalNotification");
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<CriticalNotification[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  // Track auth user; pick up sign-in/sign-out without a full reload.
  // getSession() reads the local cookie (no network) — anonymous visitors
  // pay zero auth round-trips. The id is only a query filter; RLS on
  // notifications is the real gate.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load unread criticals + subscribe to inserts for this user.
  useEffect(() => {
    if (!userId) {
      setQueue([]);
      return;
    }
    const uid: string = userId;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, action_url, created_at")
        .eq("user_id", uid)
        .eq("severity", "critical")
        .eq("is_read", false)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setQueue((data ?? []) as CriticalNotification[]);
    }
    load();

    const channel = supabase
      .channel(`critical-notifications-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const n = payload.new as {
            id: string;
            severity?: string;
            is_read?: boolean | null;
            title: string;
            message: string | null;
            action_url: string | null;
            created_at: string | null;
          };
          if (n.severity !== "critical" || n.is_read) return;
          setQueue((prev) => {
            if (prev.some((q) => q.id === n.id)) return prev;
            return [
              ...prev,
              {
                id: n.id,
                title: n.title,
                message: n.message,
                action_url: n.action_url,
                created_at: n.created_at,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const current = queue[0];

  const acknowledge = useCallback(async () => {
    if (!current || acknowledging) return;
    setAcknowledging(true);
    try {
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", current.id);
      setQueue((prev) => prev.slice(1));
    } finally {
      setAcknowledging(false);
    }
  }, [current, acknowledging]);

  if (!userId || !current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="critical-notif-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-red-600">
          <AlertTriangle className="size-4" />
          {t("severityCritical")}
        </div>
        <h2
          id="critical-notif-title"
          className="text-[20px] font-black leading-7 tracking-[-0.4px] text-slate-900 sm:text-[22px]"
        >
          {current.title}
        </h2>
        {current.message ? (
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-slate-600">
            {current.message}
          </p>
        ) : null}
        {current.action_url ? (
          <Link
            href={current.action_url}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-[13px] font-bold text-slate-700 hover:bg-slate-100"
          >
            {t("learnMore")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={acknowledge}
          disabled={acknowledging}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-[14px] font-bold text-white shadow-[0px_8px_20px_rgba(37,99,235,0.25)] transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {acknowledging ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("acknowledge")}
        </button>
        {queue.length > 1 ? (
          <p className="mt-3 text-center text-[12px] font-medium text-slate-400">
            +{queue.length - 1} {t("more")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
