"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, History, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import VipInfoModal, {
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import VipPropertyPickerModal from "@/components/renter/VipPropertyPickerModal";
import {
  fetchPricingPackages,
  getPackageDisplay,
  type PricingPackage,
} from "@/lib/pricing-packages";
import { formatDate } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;
type Property = Tables<"properties">;

const transactionLabels: Record<string, string> = {
  topup: "შევსება",
  vip_boost: "VIP",
  super_vip: "Super VIP",
  sms_package: "SMS პაკეტი",
  discount_badge: "ფასდაკლების ბეჯი",
  withdrawal: "გამოტანა",
  commission: "საკომისიო",
};

function inferTier(pkg: PricingPackage): VipInfoTier {
  if (pkg.category === "sms") return "sms";
  const tier = (pkg.meta?.tier as string | undefined) ?? "standard";
  if (tier === "super") return "super-vip";
  if (tier === "discount") return "discount";
  return "vip";
}

export default function RenterBalancePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
    packageId: string;
  }>({ open: false, tier: "super-vip", packageId: "" });

  useEffect(() => {
    fetchPricingPackages(["vip", "sms"]).then(setPackages);
  }, []);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [balanceRes, txRes, propRes] = await Promise.all([
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
          .limit(20),
        supabase
          .from("properties")
          .select("*")
          .eq("owner_id", user!.id)
          .order("created_at", { ascending: false }),
      ]);

      if (balanceRes.data) setBalance(balanceRes.data);
      if (txRes.data) setTransactions(txRes.data);
      if (propRes.data) setProperties(propRes.data);
      setLoading(false);
    }

    fetchData();

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

  const sortedPackages = useMemo(() => {
    // Show VIP first, then SMS, each sorted by sort_order
    return [...packages].sort((a, b) => {
      if (a.category !== b.category) {
        return a.category === "vip" ? -1 : 1;
      }
      return a.sort_order - b.sort_order;
    });
  }, [packages]);

  const handlePurchaseClick = async (pkg: PricingPackage) => {
    const tier = inferTier(pkg);
    if (pkg.category === "sms") {
      // SMS doesn't need property picker — invoke directly
      if (!user || !balance) return;
      setPurchasing(pkg.id);
      try {
        await supabase.functions.invoke("purchase-vip", {
          body: { package_id: pkg.id, quantity: 1 },
        });
        const { data: txData } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (txData) setTransactions(txData);
      } finally {
        setPurchasing(null);
      }
      return;
    }
    setPickerModal({ open: true, tier, packageId: pkg.id });
  };

  const handleConfirmPurchase = async (propertyId: string) => {
    if (!user || !balance) return;
    const packageId = pickerModal.packageId;
    setPurchasing(packageId);

    try {
      const { error } = await supabase.functions.invoke("purchase-vip", {
        body: {
          package_id: packageId,
          property_id: propertyId,
          quantity: 1,
        },
      });

      if (!error) {
        const { data: txData } = await supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (txData) setTransactions(txData);
      }
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          ბალანსი და VIP
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მართეთ ბალანსი და დააწინაურეთ ობიექტები საუკეთესო შედეგისთვის.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
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
              {(balance?.amount ?? 0).toFixed(2)}{" "}
              <span className="text-[28px] text-white/60">₾</span>
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
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {sortedPackages.length === 0 ? (
          <p className="col-span-full text-center text-sm text-[#94A3B8]">
            პაკეტი ჯერ არ არის ხელმისაწვდომი
          </p>
        ) : (
          sortedPackages.map((pkg) => {
            const display = getPackageDisplay(pkg);
            const Icon = display.icon;
            const canAfford = (balance?.amount ?? 0) >= pkg.amount_gel;
            const tier = inferTier(pkg);
            return (
              <div
                key={pkg.id}
                className="flex flex-col rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${display.iconBg}`}
                >
                  <Icon
                    className={`h-5 w-5 ${display.iconColor}`}
                    strokeWidth={2.2}
                  />
                </div>

                <h3 className="mt-4 text-[18px] font-black text-[#0F172A]">
                  {pkg.name}
                </h3>
                <p className="mt-1.5 text-[13px] leading-[19px] text-[#64748B]">
                  {pkg.description ?? pkg.label ?? ""}
                </p>
                <button
                  type="button"
                  onClick={() => setVipModal({ open: true, tier })}
                  className="mt-3 inline-flex items-center gap-1 self-start text-[12px] font-bold text-[#2563EB] hover:underline"
                >
                  როგორ მუშაობს?
                  <Info className="h-3 w-3" />
                </button>

                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-[28px] font-black leading-[32px] text-[#0F172A]">
                      {pkg.amount_gel.toFixed(2)}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-[#64748B]">
                      {display.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canAfford || purchasing === pkg.id}
                    onClick={() => handlePurchaseClick(pkg)}
                    className={`inline-flex items-center rounded-xl px-5 py-3 text-[13px] font-bold shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-colors disabled:opacity-50 ${display.ctaColor}`}
                  >
                    {purchasing === pkg.id ? "..." : "გააქტიურება"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="text-[18px] font-black text-[#0F172A]">ტრანზაქციები</h2>
        <div className="mt-3 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-12 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
              <History className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-2 text-sm text-[#94A3B8]">
                ტრანზაქციები ჯერ არ გაქვთ
              </p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-xl border border-[#EEF1F4] bg-white px-4 py-3 shadow-[0px_1px_2px_rgba(15,23,42,0.03)]"
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
                    <p className="text-sm font-bold text-[#0F172A]">
                      {transactionLabels[tx.type] ?? tx.type}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-extrabold ${
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

      <VipPropertyPickerModal
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        properties={properties.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.location ?? undefined,
          photoUrl: (p.photos ?? [])[0] ?? null,
          isForSale: p.is_for_sale ?? false,
        }))}
        onConfirm={handleConfirmPurchase}
      />
    </div>
  );
}
