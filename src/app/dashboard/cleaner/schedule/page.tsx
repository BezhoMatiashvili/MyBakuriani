"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDate } from "@/lib/utils/format";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from "date-fns";
import { ka } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/lib/types/database";

type CleaningTask = Database["public"]["Tables"]["cleaning_tasks"]["Row"];
type Property = Database["public"]["Tables"]["properties"]["Row"];

export default function CleanerSchedulePage() {
  const supabase = createClient();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [properties, setProperties] = useState<Record<string, Property>>({});
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchTasks() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*")
        .eq("cleaner_id", user.id)
        .order("scheduled_at", { ascending: true });

      setTasks(data ?? []);

      // Fetch properties
      if (data && data.length > 0) {
        const propertyIds = [...new Set(data.map((t) => t.property_id))];
        const { data: propData } = await supabase
          .from("properties")
          .select("*")
          .in("id", propertyIds);

        if (propData) {
          const map: Record<string, Property> = {};
          propData.forEach((p) => {
            map[p.id] = p;
          });
          setProperties(map);
        }
      }

      setLoading(false);
    }

    fetchTasks();
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart); // 0 = Sunday
  const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Monday start

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CleaningTask[]>();
    tasks.forEach((t) => {
      const key = format(new Date(t.scheduled_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const selectedTasks = selectedDate
    ? (tasksByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [])
    : [];

  const weekDays = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">განრიგი</h1>

      {/* Calendar */}
      <div className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-lg p-1.5 hover:bg-muted"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">
            {format(currentMonth, "LLLL yyyy", { locale: ka })}
          </h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-lg p-1.5 hover:bg-muted"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Week day headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {weekDays.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for offset */}
          {Array.from({ length: adjustedStart }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {daysInMonth.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(day)}
                className={`relative flex min-h-[40px] flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                  isSelected
                    ? "bg-brand-accent text-white"
                    : isToday
                      ? "bg-brand-accent-light text-brand-accent font-semibold"
                      : "hover:bg-muted text-foreground"
                }`}
              >
                {day.getDate()}
                {dayTasks.length > 0 && (
                  <span
                    className={`absolute bottom-1 size-1.5 rounded-full ${
                      isSelected ? "bg-white" : "bg-brand-accent"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date tasks */}
      {selectedDate && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            {formatDate(selectedDate)} — {selectedTasks.length} დავალება
          </h2>

          {selectedTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ამ დღეს დავალებები არ არის
            </p>
          ) : (
            <div className="space-y-3">
              {selectedTasks.map((task, i) => {
                const property = properties[task.property_id];
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            task.cleaning_type === "general"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {task.cleaning_type === "general"
                            ? "გენერალური"
                            : "სტანდარტული"}
                        </span>
                        {property && (
                          <p className="mt-1.5 text-sm font-medium text-foreground">
                            {property.title}
                          </p>
                        )}
                        {property?.location && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {property.location}
                          </p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {format(new Date(task.scheduled_at), "HH:mm")}
                        </p>
                      </div>
                      {task.price != null && (
                        <span className="text-sm font-bold text-foreground">
                          {formatPrice(task.price)}
                        </span>
                      )}
                    </div>

                    {task.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {task.notes}
                      </p>
                    )}

                    {/* Accept/Decline for pending tasks */}
                    {task.status === "pending" && (
                      <ScheduleTaskActions taskId={task.id} />
                    )}

                    {/* Status badge */}
                    <div className="mt-2">
                      <TaskStatusBadge status={task.status} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ScheduleTaskActions({ taskId }: { taskId: string }) {
  const supabase = createClient();
  const [responding, setResponding] = useState(false);

  async function accept() {
    setResponding(true);
    await supabase
      .from("cleaning_tasks")
      .update({ status: "accepted" })
      .eq("id", taskId);
    setResponding(false);
  }

  async function decline() {
    setResponding(true);
    await supabase
      .from("cleaning_tasks")
      .update({ status: "declined", cleaner_id: null })
      .eq("id", taskId);
    setResponding(false);
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={responding} onClick={accept}>
        მიღება
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={responding}
        onClick={decline}
      >
        უარყოფა
      </Button>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: { label: "მოლოდინში", classes: "bg-amber-100 text-amber-700" },
    accepted: { label: "მიღებული", classes: "bg-blue-100 text-blue-700" },
    in_progress: {
      label: "მიმდინარე",
      classes: "bg-brand-accent-light text-brand-accent",
    },
    completed: { label: "დასრულებული", classes: "bg-green-100 text-green-700" },
    declined: { label: "უარყოფილი", classes: "bg-red-100 text-red-700" },
  };

  const c = config[status] ?? {
    label: status,
    classes: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${c.classes}`}
    >
      {c.label}
    </span>
  );
}
