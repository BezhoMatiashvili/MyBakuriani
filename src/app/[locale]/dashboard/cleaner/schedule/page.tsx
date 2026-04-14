"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  MapPin,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type CleaningTaskWithProperty = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

const dayNames = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
const monthNames = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  accepted: "bg-brand-accent-light text-brand-accent",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  pending: "ახალი",
  accepted: "მიღებული",
  in_progress: "მიმდინარე",
  completed: "დასრულებული",
  cancelled: "გაუქმებული",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export default function CleanerSchedulePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [tasks, setTasks] = useState<CleaningTaskWithProperty[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (!user) return;

    async function fetchTasks() {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = getDaysInMonth(year, month);
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(title, location)")
        .eq("cleaner_id", user!.id)
        .gte("scheduled_at", `${startDate}T00:00:00`)
        .lte("scheduled_at", `${endDate}T23:59:59`)
        .order("scheduled_at", { ascending: true });

      if (data) setTasks(data as CleaningTaskWithProperty[]);
    }

    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, year, month]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CleaningTaskWithProperty[]>();
    tasks.forEach((task) => {
      const date = task.scheduled_at.split("T")[0];
      const existing = map.get(date) ?? [];
      existing.push(task);
      map.set(date, existing);
    });
    return map;
  }, [tasks]);

  const selectedTasks = selectedDate
    ? (tasksByDate.get(selectedDate) ?? [])
    : [];

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          განრიგი
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          თქვენი დალაგების კალენდარი
        </p>
      </motion.div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6"
      >
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="text-base font-semibold text-[#1E293B]">
            {monthNames[month]} {year}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-[#94A3B8]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayTasks = tasksByDate.get(dateStr) ?? [];
            const isToday = new Date().toISOString().startsWith(dateStr);
            const isSelected = selectedDate === dateStr;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={cn(
                  "relative flex h-10 flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors sm:h-12",
                  isSelected
                    ? "bg-brand-accent text-white"
                    : isToday
                      ? "bg-brand-accent/10 text-brand-accent"
                      : "hover:bg-[#F8FAFC]",
                )}
              >
                {day}
                {dayTasks.length > 0 && (
                  <span
                    className={cn(
                      "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-white" : "bg-brand-accent",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Selected date tasks */}
      {selectedDate && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-lg font-semibold text-[#1E293B]">
            {new Date(selectedDate).toLocaleDateString("ka-GE", {
              day: "numeric",
              month: "long",
            })}
          </h2>
          <div className="mt-3 space-y-3">
            {selectedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-8 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
                <Sparkles className="h-8 w-8 text-[#94A3B8]" />
                <p className="mt-2 text-sm text-[#94A3B8]">ამოცანები არ არის</p>
              </div>
            ) : (
              selectedTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1E293B]">
                        {task.properties?.title ?? "ობიექტი"}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-[#94A3B8]">
                        <MapPin className="h-3 w-3" />
                        {task.properties?.location}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[task.status ?? "pending"] ?? ""}`}
                    >
                      {statusLabels[task.status ?? "pending"] ?? task.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[#94A3B8]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(task.scheduled_at).toLocaleTimeString("ka-GE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{task.cleaning_type}</span>
                    {task.price && (
                      <span className="font-bold text-brand-accent">
                        {formatPrice(Number(task.price))}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
}
