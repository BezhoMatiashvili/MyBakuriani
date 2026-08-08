"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import {
  BookOpen,
  Star,
  Eye,
  Heart,
  Phone,
  ChevronRight,
  Sparkles,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import ListingActions from "@/components/dashboard/ListingActions";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import FoodDiscountRequestModal from "@/components/dashboard/FoodDiscountRequestModal";
import ListingPromotionBadges from "@/components/dashboard/ListingPromotionBadges";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";
import { serviceViewUrl, serviceEditUrl } from "@/lib/utils/listingUrls";
import type { Tables } from "@/lib/types/database";
import { loadFoodData, type FoodData, type OwnerStats } from "./loadData";

type Service = Tables<"services">;

export default function FoodDashboardClient({
  userId,
  initial,
}: {
  userId: string;
  initial: FoodData;
}) {
  const t = useTranslations("FoodDashboard");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();

  // Seeded from the server render — content is present on first paint, so there
  // is no loading skeleton on initial load. Realtime updates refresh silently.
  const [loading] = useState(false);
  const [restaurant, setRestaurant] = useState<Service | null>(
    initial.restaurant,
  );
  const [published, setPublished] = useState(
    initial.restaurant?.status === "active",
  );
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [stats, setStats] = useState(initial.stats);
  const [kpis, setKpis] = useState<OwnerStats | null>(initial.kpis);

  // Live: restaurant status changes and new orders/inquiries refresh without reload.
  useRealtimeSubscription(
    [
      {
        table: "services",
        event: "*",
        filter: `owner_id=eq.${userId}`,
        handler: () => void loadFoodData(supabase, userId).then(apply),
      },
      {
        table: "sms_messages",
        event: "*",
        filter: `to_user_id=eq.${userId}`,
        handler: () => void loadFoodData(supabase, userId).then(apply),
      },
    ],
    { enabled: true, channelName: "food-dashboard-rt" },
  );

  function apply(data: FoodData) {
    if (data.restaurant) {
      setRestaurant(data.restaurant);
      setPublished(data.restaurant.status === "active");
    }
    setStats(data.stats);
    setKpis(data.kpis);
  }

  async function togglePublished() {
    if (!restaurant) return;
    const next = !published;
    setPublished(next);
    await supabase
      .from("services")
      .update({ status: next ? "active" : "draft" })
      .eq("id", restaurant.id);
  }

  const name = restaurant?.title ?? tShared("defaultRestaurant");
  const rating = 0;
  const views = restaurant?.views_count ?? 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {name}
          </h1>
          <p className="mt-1 flex items-center gap-3 text-[13px] font-medium text-[#64748B]">
            {rating > 0 && (
              <span className="inline-flex items-center gap-1 text-[#F59E0B]">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                <span className="font-bold text-[#0F172A]">
                  {rating.toFixed(1)}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {tShared("views", { count: views })}
            </span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={published}
          onClick={togglePublished}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 text-[12px] font-bold text-[#0F172A] transition-colors"
        >
          <span
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{ backgroundColor: published ? "#10B981" : "#E2E8F0" }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{
                transform: published ? "translateX(18px)" : "translateX(2px)",
              }}
            />
          </span>
          <span className={published ? "text-[#10B981]" : "text-[#64748B]"}>
            {published ? tShared("published") : tShared("paused")}
          </span>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] p-8 text-white shadow-[0px_20px_50px_-12px_rgba(15,23,42,0.4)]"
      >
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F97316] opacity-20 blur-3xl"
        />
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
          <Sparkles className="h-3 w-3" />
          {t("premiumPaid")}
        </p>
        <div className="relative mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-white/60">
              {t("dailyRevenue")}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-[56px] w-[200px] bg-white/10" />
            ) : (
              <p className="mt-1 text-[36px] font-black leading-[44px] sm:text-[52px] sm:leading-[60px]">
                {stats.revenueThisMonth.toFixed(2)}
                <span className="ml-1 text-[22px] font-bold text-white/60">
                  ₾
                </span>
              </p>
            )}
          </div>
          <Link
            href="/dashboard/food/orders"
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-5 py-3 text-[13px] font-black text-white transition-colors hover:bg-[#059669]"
          >
            {t("menuAndPromo")}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#F97316]">
            <Eye className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              {tShared("stats.views")}
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#F97316]">
              {formatNumber(kpis?.views_total ?? 0)}
            </p>
          )}
        </div>
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#2563EB]">
            <BookOpen className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              {tShared("stats.menuViews")}
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#2563EB]">
              {formatNumber(kpis?.menu_views_total ?? 0)}
            </p>
          )}
        </div>
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#EF4444]">
            <Heart className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              {tShared("stats.favorites")}
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#EF4444]">
              {formatNumber(kpis?.favorites_total ?? 0)}
            </p>
          )}
        </div>
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#10B981]">
            <Phone className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              {tShared("stats.callsShort")}
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#10B981]">
              {formatNumber(kpis?.calls ?? 0)}
            </p>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        data-listing-id={restaurant?.id}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <h2 className="text-[15px] font-black text-[#0F172A]">
          {t("myListing")}
        </h2>
        {restaurant && (
          <ListingPromotionBadges
            className="mt-2"
            isVip={restaurant.is_vip}
            isSuperVip={restaurant.is_super_vip}
            vipExpiresAt={restaurant.vip_expires_at}
            discountPercent={restaurant.discount_percent}
            discountExpiresAt={restaurant.discount_expires_at}
          />
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
            <Clock className="h-4 w-4 text-[#2563EB]" />
            <span>{t("operatingHours")}</span>
            <span className="font-bold text-[#0F172A]">
              {restaurant?.operating_hours ?? tShared("notSpecified")}
            </span>
          </div>
          {restaurant?.price != null && (
            <>
              <span
                aria-hidden
                className="hidden h-5 w-px bg-[#E2E8F0] sm:block"
              />
              <div className="text-[13px] font-medium text-[#64748B]">
                {t("avgPrice")}{" "}
                <span className="font-bold text-[#0F172A]">
                  {formatPrice(Number(restaurant.price))}
                </span>
              </div>
            </>
          )}
        </div>
        {restaurant && (
          <ListingActions
            className="mt-5 border-t border-[#F1F5F9] pt-4"
            viewUrl={serviceViewUrl(restaurant)}
            editUrl={serviceEditUrl(restaurant)}
            onPromote={(tier) => setPickerModal({ open: true, tier })}
          />
        )}
      </motion.div>

      <PackagePromotionPicker
        isOpen={pickerModal.open && pickerModal.tier !== "discount"}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        flat
        listings={
          restaurant
            ? [
                {
                  id: restaurant.id,
                  title: restaurant.title,
                  subtitle: restaurant.location ?? undefined,
                  photoUrl: (restaurant.photos ?? [])[0] ?? null,
                  badgeLabel: tShared("foodBadge"),
                  badgeColor: "blue",
                },
              ]
            : []
        }
        target="service"
        onPurchased={() => loadFoodData(supabase, userId).then(apply)}
      />
      <FoodDiscountRequestModal
        isOpen={pickerModal.open && pickerModal.tier === "discount"}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        restaurant={restaurant}
      />
    </div>
  );
}
