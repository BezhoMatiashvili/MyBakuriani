"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPricingPackages,
  getPackageDisplay,
  packageDescription,
  type PricingPackage,
} from "@/lib/pricing-packages";
import VipInfoModal, {
  inferVipInfoTier,
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import BalancePackageCard from "@/components/balance/BalancePackageCard";
import TransactionList from "@/components/balance/TransactionList";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import CardTopUpLauncher from "@/components/payments/CardTopUpLauncher";
import type { Tables } from "@/lib/types/database";
import { isSuperVipActive } from "@/lib/utils/pricing";

type Transaction = Tables<"transactions">;
type Balance = Tables<"balances">;
type Service = Tables<"services">;

export default function FoodBalancePage() {
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  // Every food listing of the owner, newest first: maybeSingle() errored for
  // owners with two restaurants, which left the VIP picker empty.
  const [restaurants, setRestaurants] = useState<Service[]>([]);
  const [listingsFailed, setListingsFailed] = useState(false);
  const [pickerPkg, setPickerPkg] = useState<PricingPackage | null>(null);

  const fetchRestaurants = () =>
    supabase
      .from("services")
      .select("*")
      .eq("owner_id", user!.id)
      .eq("category", "food")
      .order("created_at", { ascending: false });

  useEffect(() => {
    fetchPricingPackages(["vip"]).then(setPackages);
  }, []);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [balRes, txRes, restaurantRes] = await Promise.all([
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
        fetchRestaurants(),
      ]);
      if (balRes.data) setBalance(balRes.data);
      if (txRes.data) setTransactions(txRes.data);
      if (restaurantRes.data) setRestaurants(restaurantRes.data);
      setListingsFailed(Boolean(restaurantRes.error));
      setLoading(false);
    }
    fetchData();
    // No realtime here: `balances` and `transactions` are not in the
    // supabase_realtime publication (trimmed 2026-07-12, contract C7), so the
    // wallet is refetched explicitly after each purchase instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Restaurants make no discounts (C21): the shared discount package is not
  // offered here.
  const visiblePackages = packages.filter(
    (pkg) => inferVipInfoTier(pkg) !== "discount",
  );

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
        className="flex flex-col items-start justify-between gap-4 rounded-[20px] bg-[#0F172A] px-8 py-7 text-white shadow-[0px_10px_30px_-8px_rgba(15,23,42,0.25)] sm:flex-row sm:flex-wrap sm:items-center"
      >
        <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:gap-8">
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
        </div>
        <CardTopUpLauncher />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3 sm:gap-4"
      >
        {visiblePackages.length === 0 ? (
          <p className="col-span-full text-center text-sm text-[#94A3B8]">
            {tShared("noPackages")}
          </p>
        ) : (
          visiblePackages.map((pkg) => {
            const display = getPackageDisplay(pkg, locale);
            const tier = inferVipInfoTier(pkg);
            // Every package needs a restaurant. A failed read must not claim
            // there is none.
            const noListings =
              !loading && !listingsFailed && restaurants.length === 0;
            const standardVipAvailable =
              tier !== "vip" ||
              listingsFailed ||
              restaurants.some(
                (r) => !isSuperVipActive(r.is_super_vip, r.vip_expires_at),
              );
            return (
              <BalancePackageCard
                key={pkg.id}
                icon={display.icon}
                iconBg={display.iconBg}
                iconColor={display.iconColor}
                title={pkg.name}
                description={packageDescription(pkg, locale)}
                price={pkg.amount_gel}
                unit={display.unit}
                ctaColor={display.ctaColor}
                available={!loading && !noListings && standardVipAvailable}
                disabledReason={
                  loading
                    ? undefined
                    : noListings
                      ? tShared("noListingsYet")
                      : standardVipAvailable
                        ? undefined
                        : tShared("noVipEligibleListings")
                }
                purchasing={false}
                onHowItWorks={() => setVipModal({ open: true, tier })}
                onActivate={() => setPickerPkg(pkg)}
              />
            );
          })
        )}
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
            restaurants.map((r) => [r.id, r.title]),
          )}
        />
      </motion.section>

      <VipInfoModal
        isOpen={vipModal.open}
        onClose={() => setVipModal((p) => ({ ...p, open: false }))}
        tier={vipModal.tier}
      />

      <PackagePromotionPicker
        isOpen={!!pickerPkg}
        onClose={() => setPickerPkg(null)}
        tier={pickerPkg ? inferVipInfoTier(pickerPkg) : "vip"}
        packageId={pickerPkg?.id}
        target="service"
        flat
        listings={restaurants.map((restaurant) => ({
          id: restaurant.id,
          title: restaurant.title,
          subtitle: restaurant.location ?? undefined,
          photoUrl: (restaurant.photos ?? [])[0] ?? null,
          badgeLabel: tShared("foodBadge"),
          badgeColor: "blue",
          standardVipDisabled: isSuperVipActive(
            restaurant.is_super_vip,
            restaurant.vip_expires_at,
          ),
          notLive: restaurant.status !== "active",
        }))}
        onPurchased={async () => {
          if (!user) return;
          const { data } = await fetchRestaurants();
          if (data) setRestaurants(data);
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
    </div>
  );
}
