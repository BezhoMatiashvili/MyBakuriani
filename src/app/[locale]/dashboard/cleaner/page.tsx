"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  Clock,
  CheckCircle,
  AlertCircle,
  MapPin,
  CalendarDays,
  Banknote,
  ArrowRight,
  Bell,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type CleaningTaskWithProperty = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

const taskStatusConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "ახალი",
    color: "bg-yellow-100 text-yellow-700",
    icon: Bell,
  },
  accepted: {
    label: "მიღებული",
    color: "bg-brand-accent-light text-brand-accent",
    icon: Clock,
  },
  in_progress: {
    label: "მიმდინარე",
    color: "bg-purple-100 text-purple-700",
    icon: Sparkles,
  },
  completed: {
    label: "დასრულებული",
    color: "bg-green-100 text-green-700",
    icon: CheckCircle,
  },
  cancelled: {
    label: "გაუქმებული",
    color: "bg-red-100 text-red-700",
    icon: AlertCircle,
  },
};

export default function CleanerDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [tasks, setTasks] = useState<CleaningTaskWithProperty[]>([]);
  const [newTasks, setNewTasks] = useState<CleaningTaskWithProperty[]>([]);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [profileRes, tasksRes, newTasksRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).single(),
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

      if (profileRes.data) setProfile(profileRes.data);
      if (tasksRes.data) setTasks(tasksRes.data as CleaningTaskWithProperty[]);
      if (newTasksRes.data)
        setNewTasks(newTasksRes.data as CleaningTaskWithProperty[]);
      setLoading(false);
    }

    fetchData();

    // Realtime new tasks
    const channel = supabase
      .channel("cleaner-new-tasks")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cleaning_tasks",
        },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const activeTasks = tasks.filter(
    (t) => t.status === "accepted" || t.status === "in_progress",
  );
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const totalEarnings = completedTasks.reduce(
    (sum, t) => sum + (t.price ?? 0),
    0,
  );

  const handleAcceptTask = async (taskId: string) => {
    if (!user) return;

    await supabase
      .from("cleaning_tasks")
      .update({ cleaner_id: user.id, status: "accepted" })
      .eq("id", taskId);

    // Refresh data
    setNewTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <div className="space-y-8 p-6 sm:p-8 lg:p-12">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          გამარჯობა, {profile?.display_name ?? "დამლაგებელი"}!
        </h1>
        <p className="text-sm font-medium text-[#64748B]">
          თქვენი დალაგების ამოცანების მართვა
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Sparkles className="h-5 w-5" />}
          label="აქტიური ამოცანები"
          value={activeTasks.length}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="შესრულებული"
          value={completedTasks.length}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="შემოსავალი"
          value={formatPrice(Number(totalEarnings))}
          change={null}
          loading={loading}
        />
      </div>

      {/* New task calls */}
      {newTasks.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-lg font-semibold text-[#1E293B]">
            ახალი გამოძახებები
          </h2>
          <div className="mt-3 space-y-3">
            {newTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-[20px] border-2 border-dashed border-brand-accent/30 bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
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
                  <Badge className="bg-yellow-100 text-yellow-700">ახალი</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#94A3B8]">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(task.scheduled_at).toLocaleDateString("ka-GE", {
                      day: "numeric",
                      month: "short",
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
                {task.notes && (
                  <p className="mt-2 text-xs text-[#94A3B8]">{task.notes}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => handleAcceptTask(task.id)}>
                    მიღება
                  </Button>
                  <Button size="sm" variant="outline">
                    გამოტოვება
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Active tasks */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1E293B]">
            აქტიური ამოცანები
          </h2>
          <Link
            href="/dashboard/cleaner/schedule"
            className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
          >
            განრიგი
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-3 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-20 w-full rounded-[var(--radius-card)]"
              />
            ))
          ) : activeTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
              <Sparkles className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2 text-sm text-[#94A3B8]">
                აქტიური ამოცანები არ არის
              </p>
            </div>
          ) : (
            activeTasks.map((task) => {
              const config =
                taskStatusConfig[task.status ?? "pending"] ??
                taskStatusConfig.pending;
              const StatusIcon = config.icon;

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-[#1E293B]">
                      {task.properties?.title ?? "ობიექტი"}
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      {new Date(task.scheduled_at).toLocaleDateString("ka-GE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </motion.section>
    </div>
  );
}
