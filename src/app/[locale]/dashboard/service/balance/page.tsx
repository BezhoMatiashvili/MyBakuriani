"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
import VipInfoModal, {
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import BalancePackageCard from "@/components/balance/BalancePackageCard";
import { formatDate } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;

interface Tier {
  id: "super_vip" | "vip" | "discount" | "sms";
  price: number;
  icon: typeof Rocket;
  iconBg: string;
  iconColor: string;
  cta: string;
}

const TIER_META: Omit<Tier, "price">[] = [
  {
    id: "super_vip",
    icon: Rocket,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
    cta: "bg-[#F97316] hover:bg-[#EA580C] text-white",
  },
  {
    id: "vip",
    icon: Star,
    iconBg: "bg-[#FFEDD5]",
    iconColor: "text-[#F97316]",
    cta: "bg-[#EC4899] hover:bg-[#DB2777] text-white",
  },
  {
    id: "discount",
    icon: Percent,
    iconBg: "bg-[#DCFCE7]",
    iconColor: "text-[#16A34A]",
    cta: "bg-[#22C55E] hover:bg-[#16A34A] text-white",
  },
  {
    id: "sms",
    icon: MessageSquare,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
    cta: "bg-[#2563EB] hover:bg-[#1E40AF] text-white",
  },
];

const TIER_PRICES: Record<Tier["id"], number> = {
  super_vip: 5.0,
  vip: 1.5,
  discount: 1.0,
  sms: 10.0,
};

const TX_TYPES = [
  "topup",
  "vip_boost",
  "super_vip",
  "sms_package",
  "discount_badge",
  "withdrawal",
  "commission",
] as const;

// Maps a local tier id to the shared info-modal tier whose copy it should show.
const TIER_TO_INFO: Record<string, VipInfoTier> = {
  super_vip: "super-vip",
  vip: "vip",
  discount: "discount",
  sms: "sms",
};

export default function ServiceBalancePage() {
  const tBalance = useTranslations("ServiceBalance");
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

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

    // Live balance + transactions — server-side top-ups / purchases reflect instantly.
    const channel = supabase
      .channel("service-balance-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "balances",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handlePurchase(tierId: Tier["id"]) {
    if (!user || !balance) return;
    setPurchasing(tierId);
    try {
      await supabase.functions.invoke("purchase-vip", {
        body: { purchase_type: tierId, days: 1 },
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
          {tShared("balanceTitle")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {tShared("balanceSubtitle")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[#0F172A] px-8 py-7 text-white shadow-[0px_10px_30px_-8px_rgba(15,23,42,0.25)] sm:flex-row sm:items-center"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/60">
            {tShared("currentBalance")}
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
          {tShared("topUpBalance")}
        </button>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {TIER_META.map((tier) => {
          const price = TIER_PRICES[tier.id];
          return (
            <BalancePackageCard
              key={tier.id}
              icon={tier.icon}
              iconBg={tier.iconBg}
              iconColor={tier.iconColor}
              title={tBalance(`tiers.${tier.id}.title`)}
              description={tBalance(`tiers.${tier.id}.description`)}
              price={price}
              unit={tBalance(`tiers.${tier.id}.unit`)}
              ctaColor={tier.cta}
              canAfford={(balance?.amount ?? 0) >= price}
              purchasing={purchasing === tier.id}
              onHowItWorks={() =>
                setVipModal({ open: true, tier: TIER_TO_INFO[tier.id] })
              }
              onActivate={() => handlePurchase(tier.id)}
            />
          );
        })}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-[16px] font-black text-[#0F172A]">
          {tShared("txHistory")}
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
                {tShared("noTransactions")}
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
                      {TX_TYPES.includes(tx.type as (typeof TX_TYPES)[number])
                        ? tShared(
                            `txTypes.${tx.type as (typeof TX_TYPES)[number]}`,
                          )
                        : tx.type}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {formatDate(tx.created_at)}
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

      <VipInfoModal
        isOpen={vipModal.open}
        onClose={() => setVipModal((p) => ({ ...p, open: false }))}
        tier={vipModal.tier}
      />
    </div>
  );
}
