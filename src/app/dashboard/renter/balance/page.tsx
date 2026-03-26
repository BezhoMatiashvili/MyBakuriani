"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  Plus,
  Rocket,
  Sparkles,
  MessageSquare,
  Tag,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { useBalance } from "@/lib/hooks/useBalance";
import { useProperties } from "@/lib/hooks/useProperties";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDate } from "@/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerChildren, slideUp } from "@/lib/utils/animations";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

const transactionLabels: Record<string, string> = {
  topup: "შევსება",
  vip_boost: "VIP ბუსტი",
  super_vip: "Super VIP",
  sms_package: "SMS პაკეტი",
  discount_badge: "ფასდაკლების ბეჯი",
  withdrawal: "გამოტანა",
  commission: "საკომისიო",
};

export default function RenterBalancePage() {
  const supabase = createClient();
  const { balance, loading: balanceLoading } = useBalance();
  const {
    properties,
    loading: propsLoading,
    list: listProperties,
  } = useProperties();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transLoading, setTransLoading] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  useEffect(() => {
    listProperties();
    fetchTransactions();
  }, [listProperties]);

  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  async function fetchTransactions() {
    setTransLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setTransactions(data ?? []);
    } catch {
      // silently fail
    } finally {
      setTransLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">ბალანსი</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          მართეთ ბალანსი, VIP და SMS პაკეტები
        </p>
      </div>

      {/* Balance card */}
      {balanceLoading ? (
        <Skeleton className="h-32 rounded-[var(--radius-card)]" />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand-primary to-brand-primary-light p-6 text-white shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-2 text-white/70">
            <Wallet className="h-5 w-5" />
            <span className="text-sm">მიმდინარე ბალანსი</span>
          </div>
          <p className="mt-2 text-3xl font-bold">
            {formatPrice(balance?.amount ?? 0)}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button className="flex items-center gap-1.5 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30">
              <Plus className="h-4 w-4" />
              შევსება
            </button>
            <span className="text-sm text-white/60">
              SMS: {balance?.sms_remaining ?? 0} დარჩენილი
            </span>
          </div>
        </motion.div>
      )}

      {/* Purchase cards */}
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* VIP Boost */}
        <motion.div
          variants={slideUp}
          className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">VIP ბუსტი</h3>
              <p className="text-xs text-muted-foreground">1.50 ₾ / დღე</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            თქვენი განცხადება გამოჩნდება სიის თავში VIP ნიშნით
          </p>

          {/* Property selector */}
          {!propsLoading && properties.length > 0 && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-brand-surface-border bg-white px-3 py-2 text-sm text-foreground"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          <button className="mt-3 w-full rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90">
            VIP აქტივაცია
          </button>
        </motion.div>

        {/* Super VIP */}
        <motion.div
          variants={slideUp}
          className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Super VIP</h3>
              <p className="text-xs text-muted-foreground">5.00 ₾ / 24 საათი</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            მაქსიმალური ხილვადობა — პირველი პოზიცია ყველა გვერდზე
          </p>

          {!propsLoading && properties.length > 0 && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-brand-surface-border bg-white px-3 py-2 text-sm text-foreground"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          <button className="mt-3 w-full rounded-lg bg-gradient-to-r from-purple-600 to-purple-400 px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90">
            Super VIP აქტივაცია
          </button>
        </motion.div>

        {/* SMS Package */}
        <motion.div
          variants={slideUp}
          className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">SMS პაკეტი</h3>
              <p className="text-xs text-muted-foreground">10.00 ₾ / 200 SMS</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            გაგზავნეთ შეტყობინებები პოტენციურ მოიჯარეებს
          </p>
          <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-center">
            <span className="text-lg font-bold text-blue-600">
              {balance?.sms_remaining ?? 0}
            </span>
            <span className="ml-1 text-xs text-blue-600/70">SMS დარჩენილი</span>
          </div>
          <button className="mt-3 w-full rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-accent-hover">
            SMS შეძენა
          </button>
        </motion.div>
      </motion.div>

      {/* Discount Badge */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                ფასდაკლების ბეჯი
              </h3>
              <p className="text-xs text-muted-foreground">1.00 ₾ / დღე</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Badge preview */}
            <span className="rounded-md bg-brand-error px-3 py-1 text-sm font-bold text-white">
              -10%
            </span>
            <button className="rounded-lg bg-brand-error px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90">
              ბეჯის აქტივაცია
            </button>
          </div>
        </div>
      </motion.div>

      {/* Transaction history */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-foreground">
          ტრანზაქციების ისტორია
        </h2>

        {transLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 text-center shadow-[var(--shadow-card)]">
            <p className="text-muted-foreground">ტრანზაქციები ჯერ არ არის</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-brand-surface-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">ტიპი</th>
                  <th className="px-4 py-3">თანხა</th>
                  <th className="px-4 py-3">აღწერა</th>
                  <th className="px-4 py-3">თარიღი</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isIncome = tx.type === "topup";
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-brand-surface-border last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full",
                              isIncome
                                ? "bg-green-100 text-green-600"
                                : "bg-red-100 text-red-600",
                            )}
                          >
                            {isIncome ? (
                              <ArrowDownLeft className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {transactionLabels[tx.type] ?? tx.type}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-sm font-bold",
                          isIncome ? "text-brand-success" : "text-brand-error",
                        )}
                      >
                        {isIncome ? "+" : "-"}
                        {formatPrice(Math.abs(tx.amount))}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {tx.description ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(tx.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
