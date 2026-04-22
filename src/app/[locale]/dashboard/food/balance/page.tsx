"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  Star,
  Percent,
  MessageSquare,
  History,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;

interface Tier {
  id: string;
  title: string;
  description: string;
  price: number;
  unit: string;
  icon: typeof Rocket;
  iconBg: string;
  iconColor: string;
  cta: string;
  ctaActive: string;
  active?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "super_vip",
    title: "SUPER VIP",
    description:
      "რესტორანი მოექცევა ძიების სათავეში და მთავარ გვერდზე 24 საათით.",
    price: 5.0,
    unit: "₾ / 24სთ",
    icon: Rocket,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
    cta: "bg-[#F97316] hover:bg-[#EA580C] text-white",
    ctaActive: "bg-[#EF4444] text-white",
  },
  {
    id: "vip",
    title: "VIP სტატუსი",
    description: "ყურადღების მიმქცევი ბეჯი და მოწინავე პოზიცია კატეგორიაში.",
    price: 1.5,
    unit: "₾ / დღე",
    icon: Star,
    iconBg: "bg-[#FFEDD5]",
    iconColor: "text-[#F97316]",
    cta: "bg-[#EC4899] hover:bg-[#DB2777] text-white",
    ctaActive: "bg-[#EF4444] text-white",
  },
  {
    id: "discount",
    title: "ფასდაკლება",
    description: "ფასდაკლების ნიშანი რესტორანზე — მეტი ყურადღება.",
    price: 1.0,
    unit: "₾ / დღე",
    icon: Percent,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
    cta: "bg-[#22C55E] hover:bg-[#16A34A] text-white",
    ctaActive: "bg-[#EF4444] text-white",
  },
  {
    id: "sms",
    title: "SMS პაკეტი",
    description: "200 SMS შეტყობინების პაკეტი სტუმრებთან კომუნიკაციისთვის.",
    price: 10.0,
    unit: "₾ / 200 SMS",
    icon: MessageSquare,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
    cta: "bg-[#2563EB] hover:bg-[#1E40AF] text-white",
    ctaActive: "bg-[#EF4444] text-white",
  },
];

const TX_LABEL: Record<string, string> = {
  topup: "შევსება",
  vip_boost: "VIP",
  super_vip: "Super VIP",
  sms_package: "SMS პაკეტი",
  discount_badge: "ფასდაკლების ბეჯი",
  withdrawal: "გამოტანა",
  commission: "საკომისიო",
};

export default function FoodBalancePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [balRes, txRes] = await Promise.all([
        supabase
          .from("balances")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (balRes.data) setBalance(balRes.data);
      if (txRes.data) setTransactions(txRes.data);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handlePurchase(tier: Tier) {
    if (!user || !balance) return;
    setPurchasing(tier.id);
    try {
      await supabase.functions.invoke("purchase-vip", {
        body: { purchase_type: tier.id, days: 1 },
      });
      const { data: txData } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (txData) setTransactions(txData);
    } finally {
      setPurchasing(null);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          ბალანსი და VIP
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მართე ბალანსი და გაააქტიურე პრომო პაკეტები.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[#0F172A] px-8 py-7 text-white shadow-[0px_10px_30px_-8px_rgba(15,23,42,0.25)] sm:flex-row sm:items-center"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">
            მიმდინარე ბალანსი
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-10 w-32 bg-white/20" />
          ) : (
            <p className="mt-2 text-[36px] font-black leading-[44px]">
              {(balance?.amount ?? 0).toFixed(2)}
              <span className="ml-1 text-[24px] text-white/60">₾</span>
            </p>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[13px] font-black text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
        >
          ბალანსის შევსება
        </button>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {TIERS.map((t) => {
          const Icon = t.icon;
          const canAfford = (balance?.amount ?? 0) >= t.price;
          const isActive = t.active;
          return (
            <div
              key={t.id}
              className="flex flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.iconBg}`}
              >
                <Icon className={`h-5 w-5 ${t.iconColor}`} strokeWidth={2.2} />
              </div>

              <h3 className="mt-4 text-[18px] font-black text-[#0F172A]">
                {t.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-[19px] text-[#64748B]">
                {t.description}
              </p>

              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className="text-[28px] font-black leading-[32px] text-[#0F172A]">
                    {t.price.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-[#64748B]">
                    {t.unit}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canAfford || purchasing === t.id}
                  onClick={() => handlePurchase(t)}
                  className={`inline-flex items-center rounded-xl px-5 py-3 text-[13px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors disabled:opacity-50 ${
                    isActive ? t.ctaActive : t.cta
                  }`}
                >
                  {purchasing === t.id
                    ? "..."
                    : isActive
                      ? "ჩართულია"
                      : "გააქტიურება"}
                </button>
              </div>
            </div>
          );
        })}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-[16px] font-black text-[#0F172A]">
          ტრანზაქციების ისტორია
        </h2>
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
              <History className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2 text-[13px] text-[#94A3B8]">
                ტრანზაქციები ჯერ არ გაქვთ
              </p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-xl border border-[#EEF1F4] bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      tx.amount >= 0
                        ? "bg-[#DCFCE7] text-[#16A34A]"
                        : "bg-[#FEE2E2] text-[#DC2626]"
                    }`}
                  >
                    {tx.amount >= 0 ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#0F172A]">
                      {TX_LABEL[tx.type] ?? tx.type}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {new Date(tx.created_at ?? "").toLocaleDateString(
                        "ka-GE",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[13px] font-extrabold ${
                    tx.amount >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"
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
