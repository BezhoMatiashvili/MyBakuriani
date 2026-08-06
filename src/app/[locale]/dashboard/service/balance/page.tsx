"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  History,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import VipInfoModal, { inferVipInfoTier, type VipInfoTier } from "@/components/renter/VipInfoModal";
import BalancePackageCard from "@/components/balance/BalancePackageCard";
import ConfirmPaymentModal from "@/components/shared/ConfirmPaymentModal";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import {
  fetchPricingPackages,
  getPackageDisplay,
  type PricingPackage,
} from "@/lib/pricing-packages";
import { formatDate } from "@/lib/utils/format";
import SandboxTopUpLauncher from "@/components/payments/SandboxTopUpLauncher";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;
type Service = Tables<"services">;

const TX_TYPES = [
  "topup",
  "vip_boost",
  "super_vip",
  "sms_package",
  "discount_badge",
  "withdrawal",
  "commission",
] as const;

export default function ServiceBalancePage() {
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [confirmPkg, setConfirmPkg] = useState<PricingPackage | null>(null);
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    pkg: PricingPackage | null;
  }>({ open: false, pkg: null });

  useEffect(() => {
    void fetchPricingPackages(["vip", "sms"]).then(setPackages);
  }, []);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [balRes, txRes, svcRes] = await Promise.all([
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
        supabase
          .from("services")
          .select("*")
          .eq("owner_id", user!.id)
          .in("category", [
            "transport",
            "entertainment",
            "employment",
            "handyman",
          ])
          .order("created_at", { ascending: false }),
      ]);
      if (balRes.data) setBalance(balRes.data);
      if (txRes.data) setTransactions(txRes.data);
      if (svcRes.data) setServices(svcRes.data);
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

  async function handlePurchase(pkg: PricingPackage) {
    if (!user || !balance) return;
    setPurchasing(pkg.id);
    try {
      const { error } = await supabase.functions.invoke("purchase-vip", {
        body: {
          package_id: pkg.id,
          quantity: 1,
        },
      });
      if (error) throw error;
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
        <SandboxTopUpLauncher />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3 sm:gap-4"
      >
        {packages.map((pkg) => {
          const display = getPackageDisplay(pkg);
          const tier = inferVipInfoTier(pkg);
          const price = pkg.amount_gel;
          return (
            <BalancePackageCard
              key={pkg.id}
              icon={display.icon}
              iconBg={display.iconBg}
              iconColor={display.iconColor}
              title={pkg.name}
              description={pkg.description ?? pkg.label ?? ""}
              price={price}
              unit={display.unit}
              ctaColor={display.ctaColor}
              canAfford={(balance?.amount ?? 0) >= price}
              purchasing={purchasing === pkg.id}
              onHowItWorks={() =>
                setVipModal({ open: true, tier })
              }
              onActivate={() =>
                pkg.category === "sms"
                  ? setConfirmPkg(pkg)
                  : setPickerModal({ open: true, pkg })
              }
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

      <PackagePromotionPicker
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.pkg ? inferVipInfoTier(pickerModal.pkg) : "vip"}
        packageId={pickerModal.pkg?.id}
        target="service"
        flat
        listings={services.map((s) => ({
          id: s.id,
          title: s.title,
          photoUrl: (s.photos ?? [])[0] ?? null,
        }))}
        onPurchased={async () => {
          if (!user) return;
          const { data } = await supabase
            .from("services")
            .select("*")
            .eq("owner_id", user.id)
            .in("category", ["transport", "entertainment", "employment", "handyman"])
            .order("created_at", { ascending: false });
          if (data) setServices(data);
        }}
      />

      <ConfirmPaymentModal
        isOpen={!!confirmPkg}
        onClose={() => setConfirmPkg(null)}
        onConfirm={async () => {
          if (confirmPkg) await handlePurchase(confirmPkg);
        }}
        title={confirmPkg?.name ?? ""}
        description={confirmPkg?.description ?? confirmPkg?.label ?? ""}
        priceLabel={
          confirmPkg ? `${confirmPkg.amount_gel.toFixed(2)} ₾` : ""
        }
        balance={balance?.amount}
      />
    </div>
  );
}
