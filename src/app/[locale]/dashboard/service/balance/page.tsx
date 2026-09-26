"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  promotionPurchaseError,
  purchaseReasonMessages,
} from "@/lib/promotion-purchase";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import VipInfoModal, {
  inferVipInfoTier,
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import BalancePackageCard from "@/components/balance/BalancePackageCard";
import TransactionList from "@/components/balance/TransactionList";
import ConfirmPaymentModal from "@/components/shared/ConfirmPaymentModal";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import {
  fetchPricingPackages,
  getPackageDisplay,
  type PricingPackage,
} from "@/lib/pricing-packages";
import CardTopUpLauncher from "@/components/payments/CardTopUpLauncher";
import type { Tables } from "@/lib/types/database";
import { isSuperVipActive } from "@/lib/utils/pricing";
import { dashboardScopeForPath } from "@/lib/notifications/scopes";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;
type Service = Tables<"services">;

export default function ServiceBalancePage() {
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const { user } = useAuth();
  const supabase = createClient();
  // Shared by the four service cabinets; vacancies are promoted with VIP and
  // SUPER VIP only, so the employment cabinet does not offer the discount.
  const isEmploymentCabinet =
    dashboardScopeForPath(usePathname()) === "employment";

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
    // No realtime here: `balances` and `transactions` are not in the
    // supabase_realtime publication (trimmed 2026-07-12, contract C7), so the
    // wallet is refetched explicitly after each purchase instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handlePurchase(pkg: PricingPackage) {
    if (!user) throw new Error(tShared("genericRetry"));
    setPurchasing(pkg.id);
    try {
      const { error } = await supabase.functions.invoke("purchase-vip", {
        body: {
          package_id: pkg.id,
          quantity: 1,
        },
      });
      if (error) {
        throw await promotionPurchaseError(error, {
          vipConflict: tShared("superVipBlocksVip"),
          network: tShared("purchaseNetworkError"),
          generic: tShared("genericRetry"),
          reasons: purchaseReasonMessages(tShared),
        });
      }
      const [balRes, txRes] = await Promise.all([
        supabase
          .from("balances")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (balRes.data) setBalance(balRes.data);
      if (txRes.data) setTransactions(txRes.data);
    } finally {
      setPurchasing(null);
    }
  }

  const visiblePackages = isEmploymentCabinet
    ? packages.filter((pkg) => inferVipInfoTier(pkg) !== "discount")
    : packages;
  const pickerTier = pickerModal.pkg
    ? inferVipInfoTier(pickerModal.pkg)
    : "vip";
  // `services` spans all four cabinets, so a discount bought from any of
  // them must not be applicable to a vacancy.
  const pickerServices =
    pickerTier === "discount"
      ? services.filter((s) => s.category !== "employment")
      : services;

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
        <CardTopUpLauncher />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3 sm:gap-4"
      >
        {visiblePackages.map((pkg) => {
          const display = getPackageDisplay(pkg, locale);
          const tier = inferVipInfoTier(pkg);
          const price = pkg.amount_gel;
          const standardVipAvailable =
            tier !== "vip" ||
            services.some(
              (service) =>
                !isSuperVipActive(service.is_super_vip, service.vip_expires_at),
            );
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
              available={standardVipAvailable}
              disabledReason={
                standardVipAvailable
                  ? undefined
                  : tShared("noVipEligibleListings")
              }
              purchasing={purchasing === pkg.id}
              onHowItWorks={() => setVipModal({ open: true, tier })}
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
        <TransactionList
          transactions={transactions}
          loading={loading}
          listingTitles={Object.fromEntries(
            services.map((s) => [s.id, s.title]),
          )}
        />
      </motion.section>

      <VipInfoModal
        isOpen={vipModal.open}
        onClose={() => setVipModal((p) => ({ ...p, open: false }))}
        tier={vipModal.tier}
      />

      <PackagePromotionPicker
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerTier}
        packageId={pickerModal.pkg?.id}
        target="service"
        flat
        listings={pickerServices.map((s) => ({
          id: s.id,
          title: s.title,
          photoUrl: (s.photos ?? [])[0] ?? null,
          standardVipDisabled: isSuperVipActive(
            s.is_super_vip,
            s.vip_expires_at,
          ),
        }))}
        onPurchased={async () => {
          if (!user) return;
          const { data } = await supabase
            .from("services")
            .select("*")
            .eq("owner_id", user.id)
            .in("category", [
              "transport",
              "entertainment",
              "employment",
              "handyman",
            ])
            .order("created_at", { ascending: false });
          if (data) setServices(data);
          // The wallet header and history stayed at the pre-purchase state.
          const [balRes, txRes] = await Promise.all([
            supabase
              .from("balances")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase
              .from("transactions")
              .select("*")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(10),
          ]);
          if (balRes.data) setBalance(balRes.data);
          if (txRes.data) setTransactions(txRes.data);
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
        priceLabel={confirmPkg ? `${confirmPkg.amount_gel.toFixed(2)} ₾` : ""}
        balance={loading ? undefined : (balance?.amount ?? 0)}
        amount={confirmPkg?.amount_gel}
        cardPayment={
          confirmPkg
            ? {
                resume: {
                  kind: "purchase-vip",
                  body: { package_id: confirmPkg.id, quantity: 1 },
                },
              }
            : undefined
        }
        validity={
          confirmPkg?.category === "sms"
            ? tShared("purchaseTerms.smsNoExpiry")
            : undefined
        }
        conditions={
          confirmPkg?.category === "sms"
            ? [tShared("purchaseTerms.smsConsent")]
            : undefined
        }
      />
    </div>
  );
}
