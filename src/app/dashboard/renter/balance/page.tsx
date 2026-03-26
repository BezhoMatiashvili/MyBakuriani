"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  Crown,
  Zap,
  MessageSquare,
  Tag,
  ArrowDownLeft,
  ArrowUpRight,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;

const boostPackages = [
  {
    id: "vip_boost",
    icon: Crown,
    title: "VIP",
    description: "გამოჩნდით VIP სექციაში",
    price: "1.50",
    unit: "₾/დღე",
    color: "bg-amber-100 text-amber-600",
  },
  {
    id: "super_vip",
    icon: Zap,
    title: "Super VIP",
    description: "მთავარ გვერდზე პირველებში",
    price: "5.00",
    unit: "₾/24სთ",
    color: "bg-purple-100 text-purple-600",
  },
  {
    id: "sms_package",
    icon: MessageSquare,
    title: "SMS პაკეტი",
    description: "200 SMS შეტყობინება",
    price: "10.00",
    unit: "₾/200 SMS",
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: "discount_badge",
    icon: Tag,
    title: "ფასდაკლების ბეჯი",
    description: "ფასდაკლების ნიშანი ობიექტზე",
    price: "1.00",
    unit: "₾/დღე",
    color: "bg-green-100 text-green-600",
  },
];

const transactionLabels: Record<string, string> = {
  topup: "შევსება",
  vip_boost: "VIP",
  super_vip: "Super VIP",
  sms_package: "SMS პაკეტი",
  discount_badge: "ფასდაკლების ბეჯი",
  withdrawal: "გამოტანა",
  commission: "საკომისიო",
};

export default function RenterBalancePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [balanceRes, txRes] = await Promise.all([
        supabase.from("balances").select("*").eq("user_id", user!.id).single(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (balanceRes.data) setBalance(balanceRes.data);
      if (txRes.data) setTransactions(txRes.data);
      setLoading(false);
    }

    fetchData();

    // Realtime balance updates
    const channel = supabase
      .channel("balance-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "balances",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) setBalance(payload.new as Balance);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handlePurchase = async (packageId: string, amount: number) => {
    if (!user || !balance) return;
    if (balance.amount < amount) return;

    setPurchasing(packageId);

    // Insert transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      amount: -amount,
      type: packageId as Transaction["type"],
      description: transactionLabels[packageId],
    });

    // Deduct balance
    await supabase
      .from("balances")
      .update({ amount: balance.amount - amount })
      .eq("user_id", user.id);

    setPurchasing(null);
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-foreground">ბალანსი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ თქვენი ბალანსი და შეიძინეთ სერვისები
        </p>
      </motion.div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand-accent to-brand-accent/80 p-6 text-white shadow-lg"
      >
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-24 bg-white/20" />
            <Skeleton className="h-10 w-32 bg-white/20" />
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-white/80">
              ხელმისაწვდომი ბალანსი
            </p>
            <p className="mt-1 text-4xl font-bold">
              {balance?.amount?.toFixed(2) ?? "0.00"} ₾
            </p>
            <div className="mt-4 flex items-center gap-4 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                SMS: {balance?.sms_remaining ?? 0}
              </span>
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                className="bg-white/20 text-white hover:bg-white/30"
              >
                <Wallet className="mr-2 h-4 w-4" />
                ბალანსის შევსება
              </Button>
            </div>
          </>
        )}
      </motion.div>

      {/* Boost packages */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-foreground">სერვისები</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {boostPackages.map((pkg) => {
            const Icon = pkg.icon;
            const price = parseFloat(pkg.price);
            const canAfford = (balance?.amount ?? 0) >= price;

            return (
              <div
                key={pkg.id}
                className="flex items-center gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${pkg.color}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {pkg.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {pkg.description}
                  </p>
                  <p className="mt-1 text-sm font-bold text-brand-accent">
                    {pkg.price} {pkg.unit}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!canAfford || purchasing === pkg.id}
                  onClick={() => handlePurchase(pkg.id, price)}
                >
                  {purchasing === pkg.id ? "..." : "შეძენა"}
                </Button>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* Transaction history */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold text-foreground">ტრანზაქციები</h2>
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-brand-surface py-12 shadow-[var(--shadow-card)]">
              <History className="h-10 w-10 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                ტრანზაქციები ჯერ არ გაქვთ
              </p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      tx.amount >= 0
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {tx.amount >= 0 ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {transactionLabels[tx.type] ?? tx.type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("ka-GE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.amount >= 0 ? "text-brand-success" : "text-brand-error"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {tx.amount.toFixed(2)} ₾
                </span>
              </div>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
