"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateShort } from "@/lib/utils/format";
import { optionKeyFor } from "@/lib/constants/listing-options";
import {
  transitionPlatformCleanerTask,
  type CleanerTaskItem,
  type CleanerTaskTransitionStatus,
} from "@/lib/cleaner/tasks";
import { loadCleanerTasks } from "./loadData";

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
  initialTasks: CleanerTaskItem[];
}) {
  const t = useTranslations("CleanerDashboard");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();

  // Seeded from the server render — content is present on first paint.
  const [tasks, setTasks] = useState<CleanerTaskItem[]>(initialTasks);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    try {
      setTasks(await loadCleanerTasks(supabase, userId));
    } catch {
      toast.error(tShared("genericRetry"));
    }
  }, [supabase, tShared, userId]);

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cleaner_manual_tasks",
          filter: `cleaner_id=eq.${userId}`,
        },
        () => fetchTasks(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchTasks]);

  async function transitionTask(
    task: CleanerTaskItem,
    next: CleanerTaskTransitionStatus,
  ) {
    const stateKey = `${task.source}:${task.id}`;
    if (updatingIds.has(stateKey)) return;
    setUpdatingIds((prev) => new Set(prev).add(stateKey));

    try {
      const stamp = new Date().toISOString();
      const result =
        task.source === "manual"
          ? await supabase
              .from("cleaner_manual_tasks")
              .update({
                status: next,
                ...(next === "in_progress" ? { started_at: stamp } : {}),
                ...(next === "completed" ? { completed_at: stamp } : {}),
              })
              .eq("id", task.id)
              .eq("cleaner_id", userId)
          : await transitionPlatformCleanerTask(supabase, task.id, next);

      if (result.error) {
        toast.error(tShared("genericRetry"));
        return;
      }

      setTasks((prev) =>
        next === "declined" || next === "cancelled" || next === "completed"
          ? prev.filter(
              (item) =>
                item.id !== task.id || item.source !== task.source,
            )
          : prev.map((item) =>
              item.id === task.id && item.source === task.source
                ? { ...item, status: next }
                : item,
            ),
      );
    } catch {
      toast.error(tShared("genericRetry"));
    } finally {
      setUpdatingIds((prev) => {
        const nextIds = new Set(prev);
        nextIds.delete(stateKey);
        return nextIds;
      });
    }
  }

  const pendingTasks = tasks.filter(
    (task) => task.source === "platform" && task.status === "pending",
  );
  const scheduledTasks = tasks.filter(
    (task) =>
      task.status === "accepted" ||
      task.status === "cancellation_requested" ||
      task.status === "in_progress",
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
                  key={`${task.source}:${task.id}`}
                  task={task}
                  disabled={updatingIds.has(`${task.source}:${task.id}`)}
                  onDecline={() => void transitionTask(task, "declined")}
                  onAccept={() => void transitionTask(task, "accepted")}
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
                  key={`${task.source}:${task.id}`}
                  task={task}
                  disabled={updatingIds.has(`${task.source}:${task.id}`)}
                  onAdvance={() =>
                    void transitionTask(
                      task,
                      task.status === "in_progress"
                        ? "completed"
                        : "in_progress",
                    )
                  }
                  onApproveCancellation={() =>
                    void transitionTask(task, "cancelled")
                  }
                  onKeepTask={() => void transitionTask(task, "accepted")}
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
  disabled,
  onDecline,
  onAccept,
}: {
  task: CleanerTaskItem;
  disabled: boolean;
  onDecline: () => void;
  onAccept: () => void;
}) {
  const t = useTranslations("CleanerDashboard");
  const tOpts = useTranslations("ListingOptions");
  const locale = useLocale();
  const ownerName = task.contactName ?? "—";
  const typeKey = optionKeyFor("cleaningTypes", task.cleaningType);

  return (
    <motion.article
      data-testid={`cleaner-pending-task-${task.source}-${task.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-bold text-[#2563EB]">
        {t("newCallBadge")}
      </span>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#F8FAFC] p-3">
        <Avatar className="h-11 w-11 shrink-0">
          {task.contactAvatar && (
            <AvatarImage src={task.contactAvatar} alt={ownerName} />
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
        {task.title ?? "—"}
      </h3>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
        <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.2} />
        {task.address ?? "—"}
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
            {dayLabel(task.scheduledAt, t, locale)} •{" "}
            {t("timeWithHour", { time: timeLabel(task.scheduledAt) })}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.08em] text-[#94A3B8]">
            {t("type")}
          </p>
          <p className="mt-1.5 text-[13px] font-extrabold text-[#0F172A]">
            {typeKey ? tOpts(`cleaningTypes.${typeKey}`) : task.cleaningType}
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
          disabled={disabled}
          className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("decline")}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
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
  disabled,
  onAdvance,
  onApproveCancellation,
  onKeepTask,
}: {
  task: CleanerTaskItem;
  disabled: boolean;
  onAdvance: () => void;
  onApproveCancellation: () => void;
  onKeepTask: () => void;
}) {
  const t = useTranslations("CleanerDashboard");
  const tManual = useTranslations("CleanerSchedule.manualTask");
  const locale = useLocale();
  const inProgress = task.status === "in_progress";
  const cancellationRequested = task.status === "cancellation_requested";

  return (
    <motion.article
      data-testid={`cleaner-scheduled-task-${task.source}-${task.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold ${
              cancellationRequested
                ? "bg-[#FEF3C7] text-[#B45309]"
                : inProgress
                ? "bg-[#EFF6FF] text-[#2563EB]"
                : "bg-[#DCFCE7] text-[#16A34A]"
            }`}
          >
            {cancellationRequested
              ? t("cancellationRequestedBadge")
              : inProgress
                ? t("inProgressBadge")
                : t("confirmedBadge")}
          </span>
          {task.source === "manual" && (
            <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[10px] font-bold text-[#64748B]">
              {tManual("manualBadge")}
            </span>
          )}
        </div>
        <p className="text-[20px] font-black text-[#0F172A]">
          {priceLabel(task.price)}
        </p>
      </div>

      <h3 className="mt-4 text-[17px] font-black leading-[22px] text-[#0F172A]">
        {task.title ?? "—"}
      </h3>
      <p className="mt-1 text-[13px] font-medium text-[#64748B]">
        {dayLabel(task.scheduledAt, t, locale)} •{" "}
        {t("timeWithHour", { time: timeLabel(task.scheduledAt) })} •{" "}
        {task.address ?? "—"}
      </p>

      {cancellationRequested ? (
        <div className="mt-5 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
          <p className="text-[12px] font-bold leading-5 text-[#92400E]">
            {t("cancellationRequestedHelp")}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onKeepTask}
              disabled={disabled}
              className="min-h-11 rounded-xl border border-[#F59E0B] bg-white px-4 text-[12px] font-bold text-[#92400E] disabled:opacity-50"
            >
              {t("keepTask")}
            </button>
            <button
              type="button"
              onClick={onApproveCancellation}
              disabled={disabled}
              className="min-h-11 rounded-xl bg-[#DC2626] px-4 text-[12px] font-bold text-white disabled:opacity-50"
            >
              {t("approveCancellation")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdvance}
          disabled={disabled}
          className={`mt-5 w-full rounded-xl px-4 py-3 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            inProgress
              ? "bg-[#16A34A] text-white hover:bg-[#15803D]"
              : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
          }`}
        >
          {inProgress ? t("markCompleted") : t("start")}
        </button>
      )}
    </motion.article>
  );
}
