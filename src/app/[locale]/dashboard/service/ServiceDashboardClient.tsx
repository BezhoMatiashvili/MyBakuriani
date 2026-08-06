"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import {
  Banknote,
  Briefcase,
  Eye,
  Heart,
  Phone,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeSubscription } from "@/lib/hooks/useRealtime";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatNumber } from "@/lib/utils/format";
import ListingActions from "@/components/dashboard/ListingActions";
import { serviceViewUrl, serviceEditUrl } from "@/lib/utils/listingUrls";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { isDiscountActive, daysRemaining } from "@/lib/utils/pricing";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";
import type { Tables } from "@/lib/types/database";
import { CATEGORY_TO_CREATE_HREF } from "@/lib/dashboard/serviceSegments";
import { loadServiceData, type OwnerStats, type ServiceData } from "./loadData";

type Service = Tables<"services">;

const CATEGORY_KEYS = [
  "entertainment",
  "transport",
  "employment",
  "handyman",
  "cleaning",
  "food",
] as const;

export default function ServiceDashboardClient({
  userId,
  initial,
  category,
}: {
  userId: string;
  initial: ServiceData;
  category: string;
}) {
  const t = useTranslations("ServiceDashboard");
  const tShared = useTranslations("DashboardShared");
  const supabase = createClient();
  const createHref = CATEGORY_TO_CREATE_HREF[category] ?? "/create/service";
  const categoryLabel = CATEGORY_KEYS.includes(
    category as (typeof CATEGORY_KEYS)[number],
  )
    ? t(`categories.${category as (typeof CATEGORY_KEYS)[number]}`)
    : t("title");

  // Seeded from the server render — content is present on first paint, so there
  // is no loading skeleton on initial load. Realtime updates refresh silently.
  const [loading] = useState(false);
  const [services, setServices] = useState<Service[]>(initial.services);
  const [stats, setStats] = useState<OwnerStats | null>(initial.stats);
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

  function applyData(data: ServiceData) {
    setServices(data.services);
    setStats(data.stats);
  }

  // Live: listing status (admin moderation) changes refresh without reload.
  useRealtimeSubscription(
    [
      {
        table: "services",
        event: "*",
        filter: `owner_id=eq.${userId}`,
        handler: () =>
          void loadServiceData(supabase, userId, category).then(applyData),
      },
    ],
    { enabled: true, channelName: "service-dashboard-rt" },
  );

  async function removeService(id: string) {
    await supabase.from("services").update({ status: "blocked" }).eq("id", id);
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "blocked" } : s)),
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {categoryLabel}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href={createHref}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.35)] hover:bg-[#1E40AF]"
        >
          <Plus className="h-4 w-4" />
          {tShared("add")}
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        <StatTile
          icon={<Eye className="h-4 w-4" />}
          label={tShared("stats.views")}
          value={formatNumber(stats?.views_total ?? 0)}
          color="text-[#2563EB]"
          bg="bg-[#EFF6FF]"
          loading={loading}
        />
        <StatTile
          icon={<Phone className="h-4 w-4" />}
          label={tShared("stats.calls")}
          value={formatNumber(stats?.calls ?? 0)}
          color="text-[#10B981]"
          bg="bg-[#ECFDF5]"
          loading={loading}
        />
        {/* Smart Match is rental-only; renders 0 here by design. */}
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          label={tShared("stats.smartMatch")}
          value={0}
          color="text-[#8B5CF6]"
          bg="bg-[#F5F3FF]"
          loading={loading}
        />
        <StatTile
          icon={<Wallet className="h-4 w-4" />}
          label={tShared("stats.spent")}
          value={formatPrice(Number(stats?.spent ?? 0))}
          color="text-[#F97316]"
          bg="bg-[#FFF7ED]"
          loading={loading}
        />
        <StatTile
          icon={<Heart className="h-4 w-4" />}
          label={tShared("stats.favorites")}
          value={formatNumber(stats?.favorites_total ?? 0)}
          color="text-[#EF4444]"
          bg="bg-[#FEF2F2]"
          loading={loading}
        />
        {/* Calendar revenue is rental-only; the RPC returns 0 for 'service'. */}
        <StatTile
          icon={<Banknote className="h-4 w-4" />}
          label={tShared("stats.revenue")}
          value={formatPrice(Number(stats?.revenue ?? 0))}
          color="text-[#64748B]"
          bg="bg-[#F8FAFC]"
          loading={loading}
        />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-black text-[#0F172A]">
            {t("myServices")}
          </h2>
          <span className="text-[12px] font-bold text-[#64748B]">
            {tShared("totalCount", { count: services.length })}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px] rounded-[20px]" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#CBD5E1] bg-white py-16 text-center">
            <Briefcase className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-[13px] font-bold text-[#0F172A]">
              {t("emptyTitle")}
            </p>
            <p className="mt-1 text-[11px] text-[#94A3B8]">{t("emptyDesc")}</p>
            <Link
              href={createHref}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-[12px] font-bold text-white hover:bg-[#1E40AF]"
            >
              <Plus className="h-4 w-4" />
              {t("addService")}
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {services.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                    {(s.photos ?? [])[0] ? (
                      <Image
                        src={(s.photos ?? [])[0]}
                        alt={s.title}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#94A3B8]">
                        <Briefcase className="h-5 w-5" />
                      </div>
                    )}
                    {s.is_vip && (
                      <span className="absolute left-1 top-1 rounded bg-[#F97316] px-1 py-0.5 text-[8px] font-black uppercase text-white">
                        VIP
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[14px] font-black text-[#0F172A]">
                        {s.title}
                      </h3>
                      {s.is_vip && (
                        <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#A16207]">
                          VIP
                          {daysRemaining(s.vip_expires_at) != null &&
                            ` · ${tShared("daysRemaining", { count: daysRemaining(s.vip_expires_at)! })}`}
                        </span>
                      )}
                      {isDiscountActive(
                        s.discount_percent,
                        s.discount_expires_at,
                      ) && (
                        <ListingBadge
                          variant="discount"
                          className="normal-case"
                        >
                          −{s.discount_percent}%
                          {daysRemaining(s.discount_expires_at) != null &&
                            ` · ${tShared("daysRemaining", { count: daysRemaining(s.discount_expires_at)! })}`}
                        </ListingBadge>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.status === "active"
                            ? "bg-[#DCFCE7] text-[#16A34A]"
                            : s.status === "pending"
                              ? "bg-[#FEF3C7] text-[#B45309]"
                              : "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                      >
                        {s.status === "active"
                          ? tShared("active")
                          : s.status === "pending"
                            ? tShared("pending")
                            : tShared("cancelled")}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[#94A3B8]">
                      <span>
                        {CATEGORY_KEYS.includes(
                          s.category as (typeof CATEGORY_KEYS)[number],
                        )
                          ? t(
                              `categories.${s.category as (typeof CATEGORY_KEYS)[number]}`,
                            )
                          : s.category}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Eye className="h-3 w-3" />
                        {s.views_count ?? 0}
                      </span>
                      {s.price != null && (
                        <>
                          <span>·</span>
                          <span className="font-bold text-[#0F172A]">
                            {formatPrice(Number(s.price))}
                            {s.price_unit && ` / ${s.price_unit}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <ListingActions
                  viewUrl={serviceViewUrl(s)}
                  editUrl={serviceEditUrl(s)}
                  onPromote={(tier) => setPickerModal({ open: true, tier })}
                  className="border-t border-[#F1F5F9] pt-4"
                >
                  <button
                    type="button"
                    onClick={() => removeService(s.id)}
                    className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </ListingActions>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      <PackagePromotionPicker
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        flat
        listings={services.map((s) => ({
          id: s.id,
          title: s.title,
          photoUrl: (s.photos ?? [])[0] ?? null,
          badgeLabel: CATEGORY_KEYS.includes(
            s.category as (typeof CATEGORY_KEYS)[number],
          )
            ? t(`categories.${s.category as (typeof CATEGORY_KEYS)[number]}`)
            : s.category,
          badgeColor: "blue",
        }))}
        target="service"
        onPurchased={() =>
          loadServiceData(supabase, userId, category).then(applyData)
        }
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
  bg,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  bg: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${color}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-20" />
      ) : (
        <p className={`mt-1 text-[22px] font-black leading-[28px] ${color}`}>
          {value}
        </p>
      )}
    </div>
  );
}
