"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  TrendingUp,
  CheckCircle,
  ArrowDownLeft,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type CleaningTask = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

export default function CleanerEarningsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<"week" | "month" | "all">(
    "month",
  );

  useEffect(() => {
    if (!user) return;

    async function fetchTasks() {
      const { data } = await supabase
        .from("cleaning_tasks")
        .select("*, properties(title, location)")
        .eq("cleaner_id", user!.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false });

      if (data) setTasks(data as CleaningTask[]);
      setLoading(false);
    }

    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    let cutoff: Date;

    switch (filterPeriod) {
      case "week":
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        return tasks;
    }

    return tasks.filter((t) => new Date(t.scheduled_at) >= cutoff);
  }, [tasks, filterPeriod]);

  const totalEarnings = filteredTasks.reduce(
    (sum, t) => sum + (t.price ?? 0),
    0,
  );
  const completedCount = filteredTasks.length;
  const avgEarning =
    completedCount > 0 ? Math.round(totalEarnings / completedCount) : 0;

  const periodLabels = {
    week: "კვირა",
    month: "თვე",
    all: "სულ",
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          შემოსავალი
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          თქვენი შემოსავლის ისტორია და სტატისტიკა
        </p>
      </motion.div>

      {/* Period filter */}
      <div className="flex gap-2">
        {(["week", "month", "all"] as const).map((period) => (
          <Button
            key={period}
            variant={filterPeriod === period ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterPeriod(period)}
          >
            {periodLabels[period]}
          </Button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="შემოსავალი"
          value={formatPrice(Number(totalEarnings))}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="შესრულებული"
          value={completedCount}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="საშუალო"
          value={formatPrice(Number(avgEarning))}
          change={null}
          loading={loading}
        />
      </div>

      {/* Earnings summary chart placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <h2 className="text-base font-semibold text-[#1E293B]">
          შემოსავალი პერიოდის მიხედვით
        </h2>
        <div className="mt-4 flex h-32 items-end gap-2">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-t-md"
                  style={{ height: `${30 + Math.random() * 70}%` }}
                />
              ))
            : (() => {
                // Group by date and show bar chart
                const earningsByDate = new Map<string, number>();
                filteredTasks.forEach((t) => {
                  const date = t.scheduled_at.split("T")[0];
                  earningsByDate.set(
                    date,
                    (earningsByDate.get(date) ?? 0) + (t.price ?? 0),
                  );
                });

                const entries = Array.from(earningsByDate.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice(-7);

                const maxVal = Math.max(...entries.map(([, v]) => v), 1);

                return entries.map(([date, amount]) => (
                  <div
                    key={date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t-md bg-brand-accent/20 transition-all"
                      style={{
                        height: `${(amount / maxVal) * 100}%`,
                        minHeight: 4,
                      }}
                    >
                      <div
                        className="h-full rounded-t-md bg-brand-accent"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <span className="text-[9px] text-[#94A3B8]">
                      {new Date(date).toLocaleDateString("ka-GE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                ));
              })()}
        </div>
      </motion.div>

      {/* Transaction history */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-[#1E293B]">ისტორია</h2>
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
              <History className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2 text-sm text-[#94A3B8]">
                ამ პერიოდში ჩანაწერები არ არის
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <ArrowDownLeft className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1E293B]">
                      {task.properties?.title ?? "დალაგება"}
                    </p>
                    <p className="text-[10px] text-[#94A3B8]">
                      {new Date(task.scheduled_at).toLocaleDateString("ka-GE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-brand-success">
                  +{formatPrice(Number(task.price ?? 0))}
                </span>
              </div>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
