"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Check,
  Clock,
  MapPin,
  Pencil,
  Play,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDateShort,
  formatNumber,
  formatTime,
} from "@/lib/utils/format";
import { optionKeyFor } from "@/lib/constants/listing-options";
import ManualTaskModal from "@/components/cleaner/ManualTaskModal";
import CleanerMonthCalendar from "@/components/cleaner/CleanerMonthCalendar";
import {
  mergeCleanerTasks,
  toLocalDateKey,
  transitionPlatformCleanerTask,
  type CleanerTaskItem,
  type ManualTaskRow,
  type PlatformTaskRow,
} from "@/lib/cleaner/tasks";

const ADD_BUTTON_CLASS =
  "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-[#0F172A] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]";

function dayPartKey(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export default function CleanerSchedulePage() {
  const t = useTranslations("CleanerSchedule");
  const tManual = useTranslations("CleanerSchedule.manualTask");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const locale = useLocale();
  const { user } = useAuth();
  const supabase = createClient();

  const [tasks, setTasks] = useState<CleanerTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState<Date>(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManualTaskRow | null>(null);
  const [listFilter, setListFilter] = useState<
    "all" | "upcoming" | "completed"
  >("all");

  const userId = user?.id;

  // Hoisted out of the effect so the modal and the row actions can refetch.
  const fetchData = useCallback(async () => {
    if (!userId) return;
    const [platform, manual] = await Promise.all([
      supabase
        .from("cleaning_tasks")
        .select(
          "*, properties(title, location), profiles!cleaning_tasks_owner_id_fkey(display_name, phone)",
        )
        .eq("cleaner_id", userId)
        .in("status", ["accepted", "in_progress", "completed"])
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("cleaner_manual_tasks")
        .select("*")
        .eq("cleaner_id", userId)
        .order("scheduled_at", { ascending: true }),
    ]);

    if (platform.error || manual.error) {
      toast.error(tShared("genericRetry"));
      setLoading(false);
      return;
    }

    setTasks(
      mergeCleanerTasks(
        (platform.data ?? []) as PlatformTaskRow[],
        (manual.data ?? []) as ManualTaskRow[],
      ),
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchData();

    const channel = supabase
      .channel("cleaner-schedule-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cleaning_tasks",
          filter: `cleaner_id=eq.${userId}`,
        },
        () => fetchData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cleaner_manual_tasks",
          filter: `cleaner_id=eq.${userId}`,
        },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchData]);

  const tasksForDay = useMemo(
    () =>
      tasks.filter(
        (task) =>
          toLocalDateKey(task.scheduledAt) === toLocalDateKey(activeDate),
      ),
    [tasks, activeDate],
  );

  const listedTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (listFilter === "completed") {
      return [...tasks]
        .filter((task) => task.status === "completed")
        .reverse();
    }
    if (listFilter === "upcoming") {
      return tasks.filter(
        (task) =>
          task.status !== "completed" &&
          new Date(task.scheduledAt).getTime() >= today.getTime(),
      );
    }
    return tasks;
  }, [listFilter, tasks]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: ManualTaskRow) {
    setEditing(row);
    setModalOpen(true);
  }

  function handleManualSaved(scheduledAt: string) {
    const savedDate = new Date(scheduledAt);
    setActiveDate(savedDate);
    setVisibleMonth(
      new Date(savedDate.getFullYear(), savedDate.getMonth(), 1),
    );
    void fetchData();
  }

  async function advance(
    task: CleanerTaskItem,
    next: "in_progress" | "completed",
  ) {
    if (!userId) return;
    const stamp = new Date().toISOString();

    const result =
      task.source === "manual"
        ? await supabase
            .from("cleaner_manual_tasks")
            .update({
              status: next,
              ...(next === "in_progress"
                ? { started_at: stamp }
                : { completed_at: stamp }),
            })
            .eq("id", task.id)
            .eq("cleaner_id", userId)
        : await transitionPlatformCleanerTask(supabase, task.id, next);

    if (result.error) {
      toast.error(tShared("genericRetry"));
      return;
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id && item.source === task.source
          ? { ...item, status: next }
          : item,
      ),
    );
  }

  async function deleteManual(id: string) {
    if (!userId) return;
    if (!window.confirm(tManual("deleteConfirm"))) return;
    const { error } = await supabase
      .from("cleaner_manual_tasks")
      .delete()
      .eq("id", id)
      .eq("cleaner_id", userId);
    if (error) {
      toast.error(tShared("genericRetry"));
      return;
    }
    setTasks((prev) =>
      prev.filter((item) => item.id !== id || item.source !== "manual"),
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {!loading && tasksForDay.length > 0 && (
            <button
              type="button"
              onClick={openCreate}
              data-testid="schedule-header-add-job"
              className={ADD_BUTTON_CLASS}
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              {tManual("addButton")}
            </button>
          )}
        </div>
      </motion.div>

      <CleanerMonthCalendar
        tasks={tasks}
        selectedDate={activeDate}
        visibleMonth={visibleMonth}
        onSelectDate={setActiveDate}
        onVisibleMonthChange={setVisibleMonth}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-black text-[#0F172A]">
          {t("selectedDayTitle", {
            date: formatDateShort(activeDate, locale),
          })}
        </h2>
        {!loading && tasksForDay.length > 0 && (
          <span className="rounded-full bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-bold text-[#2563EB]">
            {t("taskCount", { count: tasksForDay.length })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-12 rounded-xl" />
              <Skeleton className="h-[180px] flex-1 rounded-[20px]" />
            </div>
          ))}
        </div>
      ) : tasksForDay.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
        >
          <Calendar className="h-10 w-10 text-[#CBD5E1]" />
          <p className="mt-3 text-[14px] font-bold text-[#0F172A]">
            {t("emptyDayTitle")}
          </p>
          <p className="mt-1 text-[12px] text-[#94A3B8]">{t("emptyDayDesc")}</p>
          <button
            type="button"
            onClick={openCreate}
            data-testid="schedule-empty-add-job"
            className={`mt-5 ${ADD_BUTTON_CLASS}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            {tManual("addButton")}
          </button>
        </motion.div>
      ) : (
        <div data-testid="cleaner-selected-day-schedule">
          {tasksForDay.map((task, idx) => {
            const d = new Date(task.scheduledAt);
            const isDone = task.status === "completed";
            const isLast = idx === tasksForDay.length - 1;
            const isUrgent =
              !isDone && d.getTime() - Date.now() < 2 * 60 * 60 * 1000;
            const isManual = task.source === "manual";
            const typeKey = optionKeyFor("cleaningTypes", task.cleaningType);
            const typeLabel = typeKey
              ? tOpts(`cleaningTypes.${typeKey}`)
              : task.cleaningType;
            const contactValue = isManual
              ? (task.contactPhone ?? "—")
              : `${task.contactName ?? "—"}${
                  task.contactPhone ? ` (${task.contactPhone})` : ""
                }`;

            return (
              <motion.div
                key={`${task.source}:${task.id}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex gap-3 pb-6 sm:gap-4"
              >
                <div className="w-12 shrink-0 pt-1 text-right">
                  <p className="text-[14px] font-black leading-tight text-[#0F172A]">
                    {formatTime(d)}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
                    {t(`dayParts.${dayPartKey(d)}`)}
                  </p>
                </div>

                <div className="flex flex-col items-center pt-1.5">
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full ${
                      isDone
                        ? "bg-[#10B981]"
                        : "border-[3px] border-[#2563EB] bg-white"
                    }`}
                  />
                  {!isLast && (
                    <span
                      aria-hidden
                      className={`mt-1 min-h-4 flex-1 ${
                        isDone
                          ? "w-[2px] bg-[#10B981]"
                          : "w-0 border-l-2 border-dashed border-[#CBD5E1]"
                      }`}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[17px] font-black text-[#0F172A]">
                          {task.title ?? t("listingFallback")}
                        </h3>
                        {isManual && (
                          <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[10px] font-bold text-[#64748B]">
                            {tManual("manualBadge")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{task.address ?? "—"}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                        typeKey === "general"
                          ? "bg-[#E0F2FE] text-[#0284C7]"
                          : "bg-[#EFF6FF] text-[#2563EB]"
                      }`}
                    >
                      {typeLabel}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl bg-[#F8FAFC] p-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.06)]">
                        <User className="h-4 w-4 text-[#64748B]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#94A3B8]">
                          {isManual ? tManual("client") : t("owner")}
                        </p>
                        <p className="truncate text-[13px] font-bold text-[#0F172A]">
                          {contactValue}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.06)]">
                        <Clock className="h-4 w-4 text-[#64748B]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[#94A3B8]">
                          {t("dueBy")}
                        </p>
                        <p
                          className={`text-[13px] font-bold ${
                            isUrgent ? "text-[#EF4444]" : "text-[#0F172A]"
                          }`}
                        >
                          {t("atTime", { time: formatTime(d) })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isManual && task.notes && (
                    <p className="mt-3 text-[12px] font-medium leading-relaxed text-[#64748B]">
                      {task.notes}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1F4] pt-4">
                    {task.price != null ? (
                      <p className="text-[22px] font-black leading-none text-[#16A34A]">
                        {formatNumber(Number(task.price))}{" "}
                        <span className="text-[12px] font-bold text-[#94A3B8]">
                          ₾
                        </span>
                      </p>
                    ) : (
                      <span />
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {isManual && task.manual && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(task.manual!)}
                            aria-label={tShared("edit")}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteManual(task.id)}
                            aria-label={tShared("delete")}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] text-[#94A3B8] transition-colors hover:border-[#EF4444] hover:text-[#EF4444]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      {isDone ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#BBF7D0] bg-[#DCFCE7] px-4 py-2.5 text-[12px] font-bold text-[#16A34A]">
                          <Check className="h-4 w-4" />
                          {t("completedBadge")}
                        </span>
                      ) : task.status === "in_progress" ? (
                        <button
                          type="button"
                          onClick={() => advance(task, "completed")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-5 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#15803D]"
                        >
                          <Check className="h-4 w-4" />
                          {t("markCompleted")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => advance(task, "in_progress")}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
                        >
                          <Play className="h-4 w-4" />
                          {t("start")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <section
        data-testid="cleaner-all-task-list"
        className="rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[16px] font-black text-[#0F172A]">
              {t("allTasksTitle")}
            </h2>
            <p className="mt-1 text-[12px] font-medium text-[#64748B]">
              {t("allTasksHelp")}
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("listFilterLabel")}
          >
            {(["upcoming", "all", "completed"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={listFilter === filter}
                onClick={() => setListFilter(filter)}
                className={`min-h-11 rounded-full px-4 text-[12px] font-bold transition-colors ${
                  listFilter === filter
                    ? "bg-[#0F172A] text-white"
                    : "border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                }`}
              >
                {t(`listFilters.${filter}`)}
              </button>
            ))}
          </div>
        </div>

        {listedTasks.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[#F8FAFC] px-4 py-6 text-center text-[12px] font-medium text-[#94A3B8]">
            {t("listEmpty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#EEF1F4]">
            {listedTasks.map((task) => {
              const scheduled = new Date(task.scheduledAt);
              return (
                <li key={`list:${task.source}:${task.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDate(scheduled);
                      setVisibleMonth(
                        new Date(
                          scheduled.getFullYear(),
                          scheduled.getMonth(),
                          1,
                        ),
                      );
                    }}
                    className="grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-left transition-colors hover:bg-[#F8FAFC]"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-black text-[#0F172A]">
                          {task.title ?? t("listingFallback")}
                        </span>
                        {task.source === "manual" && (
                          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[9px] font-bold text-[#64748B]">
                            {tManual("manualBadge")}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[11px] font-medium text-[#64748B]">
                        {formatDateShort(scheduled, locale)} ·{" "}
                        {formatTime(scheduled)} · {task.address ?? "—"}
                      </span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        task.status === "completed"
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : task.status === "in_progress"
                            ? "bg-[#DBEAFE] text-[#1D4ED8]"
                            : "bg-[#FEF3C7] text-[#B45309]"
                      }`}
                    >
                      {task.status === "completed"
                        ? t("completedBadge")
                        : task.status === "in_progress"
                          ? t("inProgressBadge")
                          : t("scheduledBadge")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ManualTaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
        initialDate={activeDate}
        onSaved={handleManualSaved}
      />
    </div>
  );
}
