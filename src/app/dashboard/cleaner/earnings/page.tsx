"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Clock, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDate } from "@/lib/utils/format";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ka } from "date-fns/locale";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/lib/types/database";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type CleaningTask = Database["public"]["Tables"]["cleaning_tasks"]["Row"];

export default function CleanerEarningsPage() {
  const supabase = createClient();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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

      const [tasksRes, txRes] = await Promise.all([
        supabase
          .from("cleaning_tasks")
          .select("*")
          .eq("cleaner_id", user.id)
          .eq("status", "completed")
          .order("scheduled_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setTasks(tasksRes.data ?? []);
      setTransactions(txRes.data ?? []);
      setLoading(false);
    }

    fetchData();
  }, []);

  // Monthly earnings calculation
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { label: string; amount: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);

      const monthTasks = tasks.filter((t) => {
        const d = new Date(t.scheduled_at);
        return d >= start && d <= end;
      });

      const total = monthTasks.reduce((sum, t) => sum + (t.price ?? 0), 0);

      months.push({
        label: format(monthDate, "LLL", { locale: ka }),
        amount: total,
      });
    }

    return months;
  }, [tasks]);

  const totalEarned = tasks.reduce((sum, t) => sum + (t.price ?? 0), 0);

  const currentMonthStart = startOfMonth(new Date());
  const currentMonthTasks = tasks.filter(
    (t) => new Date(t.scheduled_at) >= currentMonthStart,
  );
  const currentMonthEarnings = currentMonthTasks.reduce(
    (sum, t) => sum + (t.price ?? 0),
    0,
  );

  const pendingPayments = transactions
    .filter((t) => t.type === "commission" && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const maxMonthly = Math.max(...monthlyData.map((m) => m.amount), 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">შემოსავალი</h1>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Wallet className="size-5" />}
          label="ჯამური შემოსავალი"
          value={formatPrice(totalEarned)}
          change={null}
          loading={false}
        />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="ამ თვის შემოსავალი"
          value={formatPrice(currentMonthEarnings)}
          change={null}
          loading={false}
        />
        <StatCard
          icon={<Clock className="size-5" />}
          label="მოლოდინში"
          value={formatPrice(pendingPayments)}
          change={null}
          loading={false}
        />
      </div>

      {/* Monthly chart */}
      <div className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          თვიური შემოსავალი
        </h2>
        <div className="flex items-end gap-2" style={{ height: 160 }}>
          {monthlyData.map((month, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                initial={{ height: 0 }}
                animate={{
                  height: `${(month.amount / maxMonthly) * 120}px`,
                }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className="w-full max-w-[40px] rounded-t-md bg-brand-accent"
              />
              <span className="text-[10px] text-muted-foreground">
                {month.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          ტრანზაქციები
        </h2>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ტრანზაქციები ჯერ არ არის
          </p>
        ) : (
          <div className="space-y-2">
            {transactions.slice(0, 20).map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-brand-surface px-4 py-3 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full ${
                      tx.amount >= 0
                        ? "bg-green-100 text-brand-success"
                        : "bg-red-100 text-brand-error"
                    }`}
                  >
                    <ArrowUpRight
                      className={`size-4 ${tx.amount < 0 ? "rotate-180" : ""}`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {tx.description ?? transactionTypeLabel(tx.type)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.amount >= 0 ? "text-brand-success" : "text-brand-error"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {formatPrice(tx.amount)}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function transactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    topup: "შევსება",
    withdrawal: "გატანა",
    commission: "საკომისიო",
    vip_boost: "VIP",
    super_vip: "Super VIP",
    sms_package: "SMS პაკეტი",
    discount_badge: "ფასდაკლების ბეჯი",
  };
  return labels[type] ?? type;
}
