"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateShort } from "@/lib/utils/format";
import { optionKeyFor } from "@/lib/constants/listing-options";
import { loadCleanerTasks, type TaskRow } from "./loadData";

function dayLabel(
  iso: string,
  t: ReturnType<typeof useTranslations<"CleanerDashboard">>,
  locale: string,
): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (startOfDay.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("tomorrow");
  return formatDateShort(date, locale);
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function priceLabel(price: number | null): string {
  return price != null ? `${Number(price)} ₾` : "—";
}

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

export default function CleanerDashboardClient({
  userId,
  initialTasks,
}: {
  userId: string;
  initialTasks: TaskRow[];
}) {
  const t = useTranslations("CleanerDashboard");
  const supabase = createClient();

  // Seeded from the server render — content is present on first paint.
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);

  const fetchTasks = useCallback(async () => {
    setTasks(await loadCleanerTasks(supabase, userId));
  }, [supabase, userId]);

  useEffect(() => {
    const channel = supabase
      .channel("cleaner-tasks-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cleaning_tasks",
          filter: `cleaner_id=eq.${userId}`,
        },
        () => fetchTasks(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchTasks]);

  async function updateTask(
    id: string,
    patch: { status: string; completed_at?: string },
  ) {
    await supabase.from("cleaning_tasks").update(patch).eq("id", id);
    fetchTasks();
  }

  function declineTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    void updateTask(id, { status: "declined" });
  }

  function acceptTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: "accepted" } : task,
      ),
    );
    void updateTask(id, { status: "accepted" });
  }

  function completeTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    void updateTask(id, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  }

  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const scheduledTasks = tasks.filter(
    (task) => task.status === "accepted" || task.status === "in_progress",
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("myTasks")}
        </h1>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* New calls */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-[12px] font-black tracking-[0.08em] text-[#64748B]">
            {t("newCalls")}
          </h2>
          <div className="mt-3 h-1 rounded-full bg-[#2563EB]" />

          <div className="mt-4 space-y-4">
            {pendingTasks.length === 0 ? (
              <div className="rounded-[20px] border border-[#EEF1F4] bg-white py-12 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-[13px] font-bold text-[#0F172A]">
                  {t("newCallsEmptyTitle")}
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  {t("newCallsEmptyDesc")}
                </p>
              </div>
            ) : (
              pendingTasks.map((task) => (
                <PendingTaskCard
                  key={task.id}
                  task={task}
                  onDecline={() => declineTask(task.id)}
                  onAccept={() => acceptTask(task.id)}
                />
              ))
            )}
          </div>
        </motion.section>

        {/* Scheduled work */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h2 className="text-[12px] font-black tracking-[0.08em] text-[#64748B]">
            {t("scheduledWork")}
          </h2>
          <div className="mt-3 h-1 rounded-full bg-[#16A34A]" />

          <div className="mt-4 space-y-4">
            {scheduledTasks.length === 0 ? (
              <div className="rounded-[20px] border border-[#EEF1F4] bg-white py-12 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
                <p className="text-[13px] font-bold text-[#0F172A]">
                  {t("scheduledEmptyTitle")}
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  {t("scheduledEmptyDesc")}
                </p>
              </div>
            ) : (
              scheduledTasks.map((task) => (
                <ScheduledTaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => completeTask(task.id)}
                />
              ))
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function PendingTaskCard({
  task,
  onDecline,
  onAccept,
}: {
  task: TaskRow;
  onDecline: () => void;
  onAccept: () => void;
}) {
  const t = useTranslations("CleanerDashboard");
  const tOpts = useTranslations("ListingOptions");
  const locale = useLocale();
  const ownerName = task.profiles?.display_name ?? "—";
  const typeKey = optionKeyFor("cleaningTypes", task.cleaning_type);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-bold text-[#2563EB]">
        {t("newCallBadge")}
      </span>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#F8FAFC] p-3">
        <Avatar className="h-11 w-11 shrink-0">
          {task.profiles?.avatar_url && (
            <AvatarImage src={task.profiles.avatar_url} alt={ownerName} />
          )}
          <AvatarFallback className="bg-[#E2E8F0] text-[12px] font-extrabold text-[#475569]">
            {deriveInitials(ownerName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {ownerName}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">
            {t("owner")}
          </p>
        </div>
      </div>

      <h3 className="mt-4 text-[18px] font-black leading-[24px] text-[#0F172A]">
        {task.properties?.title ?? "—"}
      </h3>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        {task.address ?? task.properties?.location ?? "—"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-[#F8FAFC] p-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.08em] text-[#94A3B8]">
            {t("dateTime")}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-extrabold text-[#0F172A]">
            <CalendarDays
              className="h-4 w-4 shrink-0 text-[#64748B]"
              strokeWidth={2.2}
            />
            {dayLabel(task.scheduled_at, t, locale)} •{" "}
            {t("timeWithHour", { time: timeLabel(task.scheduled_at) })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.08em] text-[#94A3B8]">
            {t("type")}
          </p>
          <p className="mt-1.5 text-[13px] font-extrabold text-[#0F172A]">
            {typeKey ? tOpts(`cleaningTypes.${typeKey}`) : task.cleaning_type}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#EEF1F4] pt-4">
        <p className="text-[13px] font-bold text-[#0F172A]">
          {t("offeredPrice")}
        </p>
        <p className="text-[20px] font-black text-[#16A34A]">
          {priceLabel(task.price)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEE2E2]"
        >
          {t("decline")}
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
        >
          <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
          {t("confirm")}
        </button>
      </div>
    </motion.article>
  );
}

function ScheduledTaskCard({
  task,
  onComplete,
}: {
  task: TaskRow;
  onComplete: () => void;
}) {
  const t = useTranslations("CleanerDashboard");
  const locale = useLocale();
  const inProgress = task.status === "in_progress";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold ${
            inProgress
              ? "bg-[#EFF6FF] text-[#2563EB]"
              : "bg-[#DCFCE7] text-[#16A34A]"
          }`}
        >
          {inProgress ? t("inProgressBadge") : t("confirmedBadge")}
        </span>
        <p className="text-[20px] font-black text-[#0F172A]">
          {priceLabel(task.price)}
        </p>
      </div>

      <h3 className="mt-4 text-[17px] font-black leading-[22px] text-[#0F172A]">
        {task.properties?.title ?? "—"}
      </h3>
      <p className="mt-1 text-[13px] font-medium text-[#64748B]">
        {dayLabel(task.scheduled_at, t, locale)} •{" "}
        {task.address ?? task.properties?.location ?? "—"}
      </p>

      <button
        type="button"
        onClick={onComplete}
        className="mt-5 w-full rounded-xl bg-[#F1F5F9] px-4 py-3 text-[13px] font-bold text-[#0F172A] transition-colors hover:bg-[#E2E8F0]"
      >
        {t("markCompleted")}
      </button>
    </motion.article>
  );
}
