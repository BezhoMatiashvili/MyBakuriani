"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { MapPin, Calendar, Sparkles, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatDateShort } from "@/lib/utils/format";
import { loadCleanerData, type CleanerData, type TaskRow } from "./loadData";

type TabKey = "available" | "assigned" | "done";

export default function CleanerDashboardClient({
  userId,
  initial,
}: {
  userId: string;
  initial: CleanerData;
}) {
  const t = useTranslations("CleanerDashboard");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();

  const [loading] = useState(false);
  const [myTasks, setMyTasks] = useState<TaskRow[]>(initial.myTasks);
  const [available, setAvailable] = useState<TaskRow[]>(initial.available);
  const [tab, setTab] = useState<TabKey>("available");

  useEffect(() => {
    function apply(data: CleanerData) {
      setMyTasks(data.myTasks);
      setAvailable(data.available);
    }

    const channel = supabase
      .channel("cleaner-tasks-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleaning_tasks" },
        () => loadCleanerData(supabase, userId).then(apply),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const { assignedTasks, doneTasks, todayEarnings } = useMemo(() => {
    const assigned = myTasks.filter(
      (task) => task.status === "accepted" || task.status === "in_progress",
    );
    const done = myTasks.filter((task) => task.status === "completed");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earn = done
      .filter((task) => {
        if (!task.scheduled_at) return false;
        const d = new Date(task.scheduled_at);
        return d >= today;
      })
      .reduce((sum, task) => sum + (task.price ?? 0), 0);
    return { assignedTasks: assigned, doneTasks: done, todayEarnings: earn };
  }, [myTasks]);

  async function accept(id: string) {
    await supabase
      .from("cleaning_tasks")
      .update({ cleaner_id: userId, status: "accepted" })
      .eq("id", id);
    setAvailable((prev) => prev.filter((task) => task.id !== id));
  }

  async function markDone(id: string) {
    await supabase
      .from("cleaning_tasks")
      .update({ status: "completed" })
      .eq("id", id);
    setMyTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: "completed" } : task,
      ),
    );
  }

  const rows =
    tab === "available"
      ? available
      : tab === "assigned"
        ? assignedTasks
        : doneTasks;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "available", label: t("tabAvailable"), count: available.length },
    { key: "assigned", label: t("tabAssigned"), count: assignedTasks.length },
    { key: "done", label: t("tabDone"), count: doneTasks.length },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.key}
                type="button"
                onClick={() => setTab(tabItem.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                  tab === tabItem.key
                    ? "bg-[#0F172A] text-white"
                    : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0F172A] hover:text-[#0F172A]"
                }`}
              >
                {tabItem.label} ({tabItem.count})
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
                  {t("emptyTitle")}
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  {t("emptyDesc")}
                </p>
              </div>
            ) : (
              rows.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  kind={tab}
                  onAccept={() => accept(task.id)}
                  onDone={() => markDone(task.id)}
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
              {t("todayPay")}
            </p>
            <p className="mt-3 text-[32px] font-black leading-[38px]">
              {formatPrice(Number(todayEarnings))}
            </p>
            <p className="mt-1 text-[11px] font-medium text-white/80">
              {t("completedTasks", { count: doneTasks.length })}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
              {t("stats")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
                <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
                  {tShared("active")}
                </p>
                <p className="mt-1 text-[22px] font-black text-[#0F172A]">
                  {assignedTasks.length}
                </p>
              </div>
              <div className="rounded-xl bg-[#F8FAFC] px-3 py-3">
                <p className="text-[10px] font-bold uppercase text-[#94A3B8]">
                  {tShared("completed")}
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
  const t = useTranslations("CleanerDashboard");
  const tShared = useTranslations("DashboardShared");

  const dateLabel = task.scheduled_at
    ? formatDateShort(task.scheduled_at)
    : "—";

  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black text-[#0F172A]">
            {task.properties?.title ?? tShared("defaultProperty")}
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
              {t("compensation")}
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
            {t("confirm")}
          </button>
        )}
        {kind === "assigned" && (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center gap-1 rounded-xl bg-[#10B981] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#059669]"
          >
            {t("markDone")}
          </button>
        )}
        {kind === "done" && (
          <span className="inline-flex rounded-xl bg-[#DCFCE7] px-4 py-2 text-[11px] font-bold text-[#16A34A]">
            {tShared("completed")}
          </span>
        )}
      </div>
    </div>
  );
}
