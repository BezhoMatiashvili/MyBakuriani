"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import {
  CreditCard,
  Pencil,
  Eye,
  AlertTriangle,
  Plus,
  Rocket,
  Ticket,
  Percent,
} from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils/format";
import PaymentModal from "@/components/renter/PaymentModal";
import VipInfoModal, {
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import PackagePromotionPicker from "@/components/dashboard/PackagePromotionPicker";
import { ListingBadge } from "@/components/shared/ListingBadge";
import { isDiscountActive } from "@/lib/utils/pricing";
import { propertyViewUrl } from "@/lib/utils/listingUrls";
import type { Tables } from "@/lib/types/database";
import {
  loadRenterOverview,
  type OwnerStats,
  type RenterOverview,
} from "./loadOverview";

type Property = Tables<"properties">;

const statusLabelKeys: Record<string, string> = {
  active: "statuses.active",
  blocked: "statuses.blocked",
  pending: "statuses.pending",
  draft: "statuses.draft",
};

const statusDotColor: Record<string, string> = {
  active: "bg-[#10B981]",
  blocked: "bg-[#EF4444]",
  pending: "bg-[#F59E0B]",
  draft: "bg-[#94A3B8]",
};

const statusTextColor: Record<string, string> = {
  active: "text-[#10B981]",
  blocked: "text-[#EF4444]",
  pending: "text-[#F59E0B]",
  draft: "text-[#64748B]",
};

function propertyShortId(id: string) {
  return `PR-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function formatViews(count: number) {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

export default function RenterDashboardClient({
  userId,
  initial,
}: {
  userId: string;
  initial: RenterOverview;
}) {
  const t = useTranslations("RenterDashboard");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const supabase = createClient();

  // Seeded from the server render — content is present on first paint, so there
  // is no loading skeleton on initial load. Realtime updates refresh silently.
  const [loading] = useState(false);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(
    initial.profile,
  );
  const [properties, setProperties] = useState<Property[]>(initial.properties);
  const [stats, setStats] = useState<OwnerStats | null>(initial.stats);
  const [walletBalance, setWalletBalance] = useState(initial.walletBalance);
  const [membershipExpiresAt, setMembershipExpiresAt] = useState(
    initial.membershipExpiresAt,
  );
  const [membershipPlans, setMembershipPlans] = useState(
    initial.membershipPlans,
  );
  const [matchesCount, setMatchesCount] = useState(0);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

  useEffect(() => {
    // Single source of truth for every Smart Match number on the site: open
    // requests this renter has not answered yet. The sidebar promo card and the
    // inbox's "შემოსავალი მოთხოვნები" stat resolve to the same value, so the
    // three can no longer disagree.
    async function refreshMatches() {
      const { data, error } = await supabase.rpc(
        "smart_match_actionable_count",
      );
      if (!error) setMatchesCount(data ?? 0);
    }

    function applyOverview(data: RenterOverview) {
      setProfile(data.profile);
      setProperties(data.properties);
      setStats(data.stats);
      setWalletBalance(data.walletBalance);
      setMembershipExpiresAt(data.membershipExpiresAt);
      setMembershipPlans(data.membershipPlans);
      void refreshMatches();
    }

    void refreshMatches();

    // Live: new bookings (income/receivable) and listing status changes refresh
    // the overview without a reload.
    const channel = supabase
      .channel("renter-overview-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `owner_id=eq.${userId}`,
        },
        () => loadRenterOverview(supabase, userId).then(applyOverview),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "properties",
          filter: `owner_id=eq.${userId}`,
        },
        () => loadRenterOverview(supabase, userId).then(applyOverview),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const firstName = profile?.display_name?.split(" ")[0] ?? t("defaultName");

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="flex items-center gap-2 text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("welcome", { name: firstName })}
        </h1>
        <p className="text-[14px] font-medium text-[#64748B]">
          {t.rich("seasonActive", {
            date: t("seasonEndDate"),
            b: (chunks) => (
              <strong className="font-extrabold text-[#0F172A]">
                {chunks}
              </strong>
            ),
          })}
        </p>
      </motion.div>

      {/* Membership belongs to the owner account, not an individual listing. */}
      <section className="flex flex-col gap-3 rounded-[20px] border border-[#DBEAFE] bg-[#F8FBFF] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-extrabold text-[#0F172A]">
            {membershipExpiresAt ? t("membershipActive") : t("membershipRequired")}
          </p>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            {membershipExpiresAt
              ? t("membershipExpires", {
                  date: formatDate(membershipExpiresAt, locale),
                })
              : t("membershipPrompt")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPaymentModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E40AF]"
        >
          <CreditCard className="h-4 w-4" />
          {membershipExpiresAt ? t("extendMembership") : t("activateMembership")}
        </button>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={tShared("stats.views")}
          value={formatNumber(stats?.views_total ?? 0)}
          change={null}
          loading={loading}
          valueColor="accent"
        />
        <StatCard
          label={tShared("stats.calls")}
          value={formatNumber(stats?.calls ?? 0)}
          change={null}
          loading={loading}
          valueColor="default"
        />
        <StatCard
          label={tShared("stats.smartMatch")}
          value={formatNumber(matchesCount)}
          change={null}
          loading={loading}
          valueColor="accent"
        />
        <StatCard
          label={tShared("stats.spent")}
          value={formatPrice(Number(stats?.spent ?? 0))}
          change={null}
          loading={loading}
          valueColor="warning"
        />
        <StatCard
          label={tShared("stats.favorites")}
          value={formatNumber(stats?.favorites_total ?? 0)}
          change={null}
          loading={loading}
          valueColor="success"
        />
        <StatCard
          label={tShared("stats.revenue")}
          value={formatPrice(Number(stats?.revenue ?? 0))}
          change={null}
          loading={loading}
          valueColor="default"
        />
      </div>

      {/* My properties section */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-black text-[#0F172A]">
            {t("myProperties")}
          </h2>
          <Link
            href="/create/rental"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            {t("newProperty")}
          </Link>
        </div>

        <div className="mt-4 space-y-4">
          {loading &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex gap-4">
                  <Skeleton className="h-[88px] w-[88px] rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}

          {!loading &&
            properties.map((property) => {
              const isBlocked =
                property.status === "blocked" || property.status === "draft";
              const statusKey = property.status ?? "draft";
              return (
                <PropertyRow
                  key={property.id}
                  property={property}
                  statusKey={statusKey}
                  isBlocked={isBlocked}
                  hasMembership={Boolean(membershipExpiresAt)}
                  onMembership={() => setPaymentModalOpen(true)}
                  onOpenTier={(tier) => setPickerModal({ open: true, tier })}
                />
              );
            })}

          {!loading && properties.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E2E8F0] bg-white py-14 text-center">
              <AlertTriangle className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#64748B]">
                {t("noProperties")}
              </p>
              <Link
                href="/create/rental"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#1E40AF]"
              >
                <Plus className="h-4 w-4" />
                {t("newProperty")}
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        membershipExpiresAt={membershipExpiresAt}
        walletBalance={walletBalance}
        plans={membershipPlans}
        onPurchased={async () => {
          const data = await loadRenterOverview(supabase, userId);
          setProfile(data.profile);
          setProperties(data.properties);
          setStats(data.stats);
          setWalletBalance(data.walletBalance);
          setMembershipExpiresAt(data.membershipExpiresAt);
          setMembershipPlans(data.membershipPlans);
        }}
      />

      <VipInfoModal
        isOpen={vipModal.open}
        onClose={() => setVipModal((p) => ({ ...p, open: false }))}
        tier={vipModal.tier}
      />

      <PackagePromotionPicker
        isOpen={pickerModal.open}
        onClose={() => setPickerModal((p) => ({ ...p, open: false }))}
        tier={pickerModal.tier}
        listings={properties.map((p) => ({
          id: p.id,
          title: p.title,
          subtitle: p.location ?? undefined,
          photoUrl: (p.photos ?? [])[0] ?? null,
          isForSale: p.is_for_sale ?? false,
          price: (p.is_for_sale ? p.sale_price : p.price_per_night) ?? null,
        }))}
        target="property"
        onPurchased={async () => {
          const data = await loadRenterOverview(supabase, userId);
          setProfile(data.profile);
          setProperties(data.properties);
          setStats(data.stats);
        }}
      />
    </div>
  );
}

function PropertyRow({
  property,
  statusKey,
  isBlocked,
  hasMembership,
  onMembership,
  onOpenTier,
}: {
  property: Property;
  statusKey: string;
  isBlocked: boolean;
  hasMembership: boolean;
  onMembership: () => void;
  onOpenTier: (tier: VipInfoTier) => void;
}) {
  const t = useTranslations("RenterDashboard");
  const photo = (property.photos ?? [])[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-[20px] border bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)] ${
        isBlocked ? "border-dashed border-[#FCA5A5]" : "border-[#EEF1F4]"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Thumbnail */}
        <div
          className={`relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-2xl ${
            isBlocked
              ? "border border-dashed border-[#FCA5A5] bg-[#FEF2F2]"
              : "bg-[#F8FAFC]"
          }`}
        >
          {isBlocked ? (
            <div className="flex h-full w-full items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-[#EF4444]" />
            </div>
          ) : photo ? (
            <Image
              src={photo}
              alt={property.title}
              fill
              className="object-cover"
            />
          ) : null}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold text-[#0F172A]">
            {property.title}
          </h3>
          {isDiscountActive(
            property.discount_percent,
            property.discount_expires_at,
          ) && (
            <ListingBadge variant="discount" className="mt-1 normal-case">
              −{property.discount_percent}%
            </ListingBadge>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[#94A3B8]">
            {property.is_for_sale ? (
              <span className="rounded-md bg-[#FFEDD5] px-2 py-0.5 font-bold text-[#EA580C]">
                {t("forSale")}
              </span>
            ) : (
              <span className="rounded-md bg-[#DBEAFE] px-2 py-0.5 font-bold text-[#2563EB]">
                {t("forRent")}
              </span>
            )}
            <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 font-bold text-[#16A34A]">
              {t("idPrefix")} {propertyShortId(property.id)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusDotColor[statusKey] ?? ""}`}
              />
              <span
                className={`text-[11px] font-bold ${statusTextColor[statusKey] ?? ""}`}
              >
                {statusLabelKeys[statusKey]
                  ? t(statusLabelKeys[statusKey])
                  : statusKey}
              </span>
            </span>
            {!isBlocked && (
              <span>
                {t("viewsLabel")} {formatViews(property.views_count ?? 0)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {!isBlocked && (
            <button
              type="button"
              onClick={onMembership}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 text-[12px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
            >
              <CreditCard className="h-3.5 w-3.5" />
              {hasMembership ? t("extendMembership") : t("pay")}
            </button>
          )}
          <a
            href={propertyViewUrl(property)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Eye className="h-3.5 w-3.5" />
            {t("view")}
          </a>
          <Link
            href={`/create/rental?edit=${property.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("edit")}
          </Link>
        </div>
      </div>

      {/* Promo tier row */}
      {!isBlocked && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-4">
          <span className="mr-auto text-[12px] font-semibold text-[#64748B]">
            {t("adPromotion")}
          </span>
          <button
            type="button"
            onClick={() => onOpenTier("super-vip")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#EA580C] transition-colors hover:bg-[#FFEDD5]"
          >
            <Rocket className="h-3 w-3" />
            SUPER VIP
          </button>
          <button
            type="button"
            onClick={() => onOpenTier("vip")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FBCFE8] bg-[#FCE7F3] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#BE185D] transition-colors hover:bg-[#FBCFE8]"
          >
            <Ticket className="h-3 w-3" />
            VIP
          </button>
          <button
            type="button"
            onClick={() => onOpenTier("discount")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-black tracking-wide text-[#15803D] transition-colors hover:bg-[#BBF7D0]"
          >
            <Percent className="h-3 w-3" />
            {t("discount")}
          </button>
        </div>
      )}
    </motion.div>
  );
}
