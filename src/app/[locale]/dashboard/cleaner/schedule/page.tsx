"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, CheckCircle2, Calendar, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type TaskRow = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

const GE_DAY = ["კვი", "ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შბ"];
const GE_MONTH = [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ",
];

function dayBucket(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CleanerSchedulePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string>(dayBucket(new Date()));

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(title, location)")
        .eq("cleaner_id", user!.id)
        .order("scheduled_at", { ascending: true });
      if (data) setTasks(data as TaskRow[]);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const upcomingDays = useMemo(() => {
    const days: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const tasksForActive = useMemo(
    () =>
      tasks
        .filter((t) =>
          t.scheduled_at
            ? dayBucket(new Date(t.scheduled_at)) === activeDay
            : false,
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_at ?? 0).getTime() -
            new Date(b.scheduled_at ?? 0).getTime(),
        ),
    [tasks, activeDay],
  );

  async function markDone(id: string) {
    await supabase
      .from("cleaning_tasks")
      .update({ status: "completed" })
      .eq("id", id);
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "completed" } : t)),
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          ჩემი გრაფიკი
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          დაგეგმე დღე, ნახე დავალებების დრო და ადგილმდებარეობა.
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        {upcomingDays.map((d) => {
          const key = dayBucket(d);
          const active = key === activeDay;
          const isToday = key === dayBucket(new Date());
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveDay(key)}
              className={`flex min-w-[70px] flex-col items-center rounded-2xl border px-4 py-2 transition-colors ${
                active
                  ? "border-[#0F172A] bg-[#0F172A] text-white"
                  : "border-[#E2E8F0] bg-white text-[#0F172A] hover:border-[#0F172A]"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase ${
                  active ? "text-white/70" : "text-[#94A3B8]"
                }`}
              >
                {GE_DAY[d.getDay()]}
              </span>
              <span className="mt-0.5 text-[18px] font-black leading-none">
                {d.getDate()}
              </span>
              <span
                className={`mt-0.5 text-[10px] font-medium ${
                  active ? "text-white/70" : "text-[#94A3B8]"
                }`}
              >
                {isToday ? "დღეს" : GE_MONTH[d.getMonth()]}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : tasksForActive.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-[14px] font-bold text-[#0F172A]">
              დავალება არ გაქვს
            </p>
            <p className="mt-1 text-[12px] text-[#94A3B8]">
              არჩეული დღისთვის დაგეგმილი დავალებები აქ გამოჩნდება.
            </p>
          </div>
        ) : (
          <ul className="relative">
            <span
              aria-hidden
              className="absolute left-[58px] top-6 bottom-6 w-px bg-[#E2E8F0]"
            />
            {tasksForActive.map((t, idx) => {
              const d = t.scheduled_at ? new Date(t.scheduled_at) : null;
              const isDone = t.status === "completed";
              return (
                <li key={t.id} className="relative flex gap-4 py-4">
                  <div className="w-[48px] shrink-0 text-right">
                    <p className="text-[13px] font-black text-[#0F172A]">
                      {d
                        ? d.toLocaleTimeString("ka-GE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>
                  <span
                    className={`relative z-10 mt-1.5 h-[10px] w-[10px] shrink-0 rounded-full border-2 border-white ${
                      isDone
                        ? "bg-[#10B981]"
                        : idx === 0
                          ? "bg-[#0F172A]"
                          : "bg-[#CBD5E1]"
                    }`}
                  />
                  <div className="min-w-0 flex-1 rounded-2xl border border-[#EEF1F4] bg-[#F8FAFC] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[14px] font-black text-[#0F172A]">
                          {t.properties?.title ?? "ობიექტი"}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#64748B]">
                          <MapPin className="h-3 w-3" />
                          {t.properties?.location ?? "—"}
                        </p>
                      </div>
                      {t.price != null && (
                        <span className="shrink-0 text-[13px] font-black text-[#0F8F60]">
                          {formatPrice(Number(t.price))}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-3 py-1 text-[11px] font-bold text-[#16A34A]">
                          <CheckCircle2 className="h-3 w-3" />
                          დასრულებული
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markDone(t.id)}
                          className="inline-flex items-center gap-1 rounded-xl bg-[#0F172A] px-4 py-2 text-[11px] font-bold text-white hover:bg-[#1E293B]"
                        >
                          დასრულება
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
