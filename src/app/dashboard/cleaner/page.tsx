"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Wallet,
  ToggleLeft,
  ToggleRight,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/useProfile";
import { formatPrice, formatDate } from "@/lib/utils/format";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/types/database";

type CleaningTask = Database["public"]["Tables"]["cleaning_tasks"]["Row"];

export default function CleanerDashboardPage() {
  const supabase = createClient();
  const { profile, loading: profileLoading } = useProfile();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [monthlyEarnings, setMonthlyEarnings] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch cleaning tasks assigned to this cleaner
      const { data: taskData } = await supabase
        .from("cleaning_tasks")
        .select("*")
        .eq("cleaner_id", user.id)
        .order("scheduled_at", { ascending: false });

      setTasks(taskData ?? []);

      // Calculate monthly earnings
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const completedThisMonth = (taskData ?? []).filter(
        (t) =>
          t.status === "completed" && new Date(t.scheduled_at) >= startOfMonth,
      );
      const total = completedThisMonth.reduce(
        (sum, t) => sum + (t.price ?? 0),
        0,
      );
      setMonthlyEarnings(total);
      setLoading(false);
    }

    fetchData();
  }, []);

  const activeTask = tasks.find(
    (t) => t.status === "in_progress" || t.status === "accepted",
  );
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  if (profileLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with availability toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            გამარჯობა, {profile?.display_name ?? "დამლაგებელი"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            დამლაგებლის პანელი
          </p>
        </div>
        <button
          onClick={() => setAvailable(!available)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {available ? (
            <>
              <ToggleRight className="size-6 text-brand-success" />
              <span className="text-brand-success">ხელმისაწვდომი</span>
            </>
          ) : (
            <>
              <ToggleLeft className="size-6 text-muted-foreground" />
              <span className="text-muted-foreground">დაკავებული</span>
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<CheckCircle2 className="size-5" />}
          label="შესრულებული ამ თვეში"
          value={completedCount}
          change={null}
          loading={false}
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          label="შემოსავალი ამ თვეში"
          value={formatPrice(monthlyEarnings)}
          change={null}
          loading={false}
        />
        <StatCard
          icon={<Clock className="size-5" />}
          label="მოლოდინში"
          value={pendingTasks.length}
          change={null}
          loading={false}
        />
      </div>

      {/* Active task */}
      {activeTask && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            მიმდინარე დავალება
          </h2>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[var(--radius-card)] border-2 border-brand-accent bg-brand-surface p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center rounded-full bg-brand-accent-light px-2.5 py-0.5 text-xs font-medium text-brand-accent">
                  {activeTask.cleaning_type === "general"
                    ? "გენერალური"
                    : "სტანდარტული"}
                </span>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  დავალება #{activeTask.id.slice(0, 8)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(activeTask.scheduled_at)}
                </p>
              </div>
              {activeTask.price != null && (
                <span className="text-lg font-bold text-foreground">
                  {formatPrice(activeTask.price)}
                </span>
              )}
            </div>
            {activeTask.notes && (
              <p className="mt-3 text-sm text-muted-foreground">
                {activeTask.notes}
              </p>
            )}
          </motion.div>
        </section>
      )}

      {/* Incoming requests */}
      {pendingTasks.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            ახალი მოთხოვნები ({pendingTasks.length})
          </h2>
          <div className="space-y-3">
            {pendingTasks.map((task, i) => (
              <CleaningRequestCard key={task.id} task={task} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!activeTask && pendingTasks.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Sparkles className="size-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            ამჟამად ახალი დავალებები არ არის
          </p>
        </div>
      )}
    </div>
  );
}

function CleaningRequestCard({
  task,
  index,
}: {
  task: CleaningTask;
  index: number;
}) {
  const supabase = createClient();
  const [responding, setResponding] = useState(false);

  async function handleAccept() {
    setResponding(true);
    await supabase
      .from("cleaning_tasks")
      .update({ status: "accepted" })
      .eq("id", task.id);
    setResponding(false);
  }

  async function handleDecline() {
    setResponding(true);
    await supabase
      .from("cleaning_tasks")
      .update({ status: "declined", cleaner_id: null })
      .eq("id", task.id);
    setResponding(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {task.cleaning_type === "general" ? "გენერალური" : "სტანდარტული"}
          </span>
          <p className="mt-1.5 text-sm font-medium text-foreground">
            {formatDate(task.scheduled_at)}
          </p>
          {task.notes && (
            <p className="mt-0.5 text-xs text-muted-foreground">{task.notes}</p>
          )}
        </div>
        {task.price != null && (
          <span className="text-sm font-bold text-foreground">
            {formatPrice(task.price)}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={responding} onClick={handleAccept}>
          მიღება
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={responding}
          onClick={handleDecline}
        >
          უარყოფა
        </Button>
      </div>
    </motion.div>
  );
}
