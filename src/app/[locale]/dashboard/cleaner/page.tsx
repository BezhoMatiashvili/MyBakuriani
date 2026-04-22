"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Calendar, Sparkles, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type TaskRow = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

type TabKey = "available" | "assigned" | "done";

export default function CleanerDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<TaskRow[]>([]);
  const [available, setAvailable] = useState<TaskRow[]>([]);
  const [tab, setTab] = useState<TabKey>("available");

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [mineRes, poolRes] = await Promise.all([
        supabase
          .from("cleaning_tasks")
          .select("*, properties(title, location)")
          .eq("cleaner_id", user!.id)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("cleaning_tasks")
          .select("*, properties(title, location)")
          .is("cleaner_id", null)
          .eq("status", "pending")
          .order("scheduled_at", { ascending: true })
          .limit(10),
      ]);
      if (mineRes.data) setMyTasks(mineRes.data as TaskRow[]);
      if (poolRes.data) setAvailable(poolRes.data as TaskRow[]);
      setLoading(false);
    }
    fetchData();

    const channel = supabase
      .channel("cleaner-tasks-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_tasks" },
        () => fetchData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const { assignedTasks, doneTasks, todayEarnings } = useMemo(() => {
    const assigned = myTasks.filter(
      (t) => t.status === "accepted" || t.status === "in_progress",
    );
    const done = myTasks.filter((t) => t.status === "completed");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earn = done
      .filter((t) => {
        if (!t.scheduled_at) return false;
        const d = new Date(t.scheduled_at);
        return d >= today;
      })
      .reduce((sum, t) => sum + (t.price ?? 0), 0);
    return { assignedTasks: assigned, doneTasks: done, todayEarnings: earn };
  }, [myTasks]);

  async function accept(id: string) {
    if (!user) return;
    await supabase
      .from("cleaning_tasks")
      .update({ cleaner_id: user.id, status: "accepted" })
      .eq("id", id);
    setAvailable((prev) => prev.filter((t) => t.id !== id));
  }

  async function markDone(id: string) {
    await supabase
      .from("cleaning_tasks")
      .update({ status: "completed" })
      .eq("id", id);
    setMyTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "completed" } : t)),
    );
  }

  const rows =
    tab === "available"
      ? available
      : tab === "assigned"
        ? assignedTasks
        : doneTasks;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "available", label: "ახალი დავალებები", count: available.length },
    { key: "assigned", label: "აქტიური", count: assignedTasks.length },
    { key: "done", label: "დასრულებული", count: doneTasks.length },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          ჩემი დავალები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მიიღე ახალი გამოძახებები და მართე შენი განრიგი.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                  tab === t.key
                    ? "bg-[#0F172A] text-white"
                    : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0F172A] hover:text-[#0F172A]"
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[140px] rounded-[20px]" />
              ))
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
                <Sparkles className="h-10 w-10 text-[#CBD5E1]" />
                <p className="mt-2 text-[13px] font-bold text-[#0F172A]">
                  ამჟამად დავალებები არ არის
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  ახალი გამოძახება მალე გამოჩნდება აქ.
                </p>
              </div>
            ) : (
              rows.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  kind={tab}
                  onAccept={() => accept(t.id)}
                  onDone={() => markDone(t.id)}
                />
              ))
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-gradient-to-br from-[#10B981] to-[#059669] p-5 text-white shadow-[0px_10px_30px_-8px_rgba(16,185,129,0.4)]"
          >
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/80">
              <Wallet className="h-3.5 w-3.5" />
              დღევანდელი ხელფასი
            </p>
            <p className="mt-3 text-[32px] font-black leading-[38px]">
              {formatPrice(Number(todayEarnings))}
            </p>
            <p className="mt-1 text-[11px] font-medium text-white/80">
              {doneTasks.length} დასრულებული დავალება
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
              სტატისტიკა
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
                <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
                  აქტიური
                </p>
                <p className="mt-1 text-[22px] font-black text-[#0F172A]">
                  {assignedTasks.length}
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
                <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
                  დასრულებული
                </p>
                <p className="mt-1 text-[22px] font-black text-[#10B981]">
                  {doneTasks.length}
                </p>
              </div>
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  kind,
  onAccept,
  onDone,
}: {
  task: TaskRow;
  kind: TabKey;
  onAccept: () => void;
  onDone: () => void;
}) {
  const dateLabel = task.scheduled_at
    ? new Date(task.scheduled_at).toLocaleDateString("ka-GE", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black text-[#0F172A]">
            {task.properties?.title ?? "ობიექტი"}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#64748B]">
            <MapPin className="h-3.5 w-3.5" />
            {task.properties?.location ?? "—"}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#64748B]">
            <Calendar className="h-3.5 w-3.5" />
            {dateLabel}
          </p>
        </div>
        {task.price != null && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
              ანაზღაურება
            </p>
            <p className="text-[18px] font-black text-[#0F8F60]">
              {formatPrice(Number(task.price))}
            </p>
          </div>
        )}
      </div>

      {task.notes && (
        <p className="mt-3 rounded-xl bg-[#F8FAFC] p-3 text-[12px] leading-[18px] text-[#64748B]">
          {task.notes}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {kind === "available" && (
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex items-center gap-1 rounded-xl bg-[#0F172A] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E293B]"
          >
            დადასტურება
          </button>
        )}
        {kind === "assigned" && (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-1 rounded-xl bg-[#10B981] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#059669]"
          >
            დასრულება
          </button>
        )}
        {kind === "done" && (
          <span className="inline-flex rounded-xl bg-[#DCFCE7] px-4 py-2 text-[11px] font-bold text-[#16A34A]">
            დასრულებული
          </span>
        )}
      </div>
    </div>
  );
}
