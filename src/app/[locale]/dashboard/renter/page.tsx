"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import {
  CreditCard,
  Pencil,
  AlertTriangle,
  Plus,
  Rocket,
  Ticket,
  Percent,
} from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import PaymentModal from "@/components/renter/PaymentModal";
import VipInfoModal, {
  type VipInfoTier,
} from "@/components/renter/VipInfoModal";
import VipPropertyPickerModal from "@/components/renter/VipPropertyPickerModal";
import type { Tables } from "@/lib/types/database";

type Property = Tables<"properties">;

const statusLabels: Record<string, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილია",
  pending: "მოლოდინში",
  draft: "დრაფტი",
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

export default function RenterDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [receivable, setReceivable] = useState(0);
  const [occupancy, setOccupancy] = useState(0);
  const [totalViews, setTotalViews] = useState(0);

  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    status: "pending" | "paid";
    title: string;
  }>({ open: false, status: "pending", title: "" });
  const [vipModal, setVipModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    tier: VipInfoTier;
  }>({ open: false, tier: "super-vip" });

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [profileRes, propertiesRes, bookingsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).single(),
        supabase
          .from("properties")
          .select("*")
          .eq("owner_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase.from("bookings").select("*").eq("owner_id", user!.id),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (propertiesRes.data) {
        setProperties(propertiesRes.data);
        setTotalViews(
          propertiesRes.data.reduce((sum, p) => sum + (p.views_count ?? 0), 0),
        );
      }

      if (bookingsRes.data) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const completedThisMonth = bookingsRes.data.filter(
          (b) =>
            b.status === "completed" && new Date(b.check_out) >= monthStart,
        );
        const pendingBookings = bookingsRes.data.filter(
          (b) => b.status === "confirmed",
        );
        setMonthlyIncome(
          completedThisMonth.reduce((sum, b) => sum + b.total_price, 0),
        );
        setReceivable(
          pendingBookings.reduce((sum, b) => sum + b.total_price, 0),
        );

        const totalProps = propertiesRes.data?.length ?? 1;
        const daysInMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
        ).getDate();
        const bookedDays = bookingsRes.data.filter(
          (b) =>
            (b.status === "confirmed" || b.status === "completed") &&
            new Date(b.check_in) <=
              new Date(now.getFullYear(), now.getMonth() + 1, 0) &&
            new Date(b.check_out) >= monthStart,
        ).length;

        setOccupancy(
          totalProps > 0
            ? Math.round((bookedDays / (totalProps * daysInMonth)) * 100)
            : 0,
        );
      }

      setLoading(false);
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const firstName = profile?.display_name?.split(" ")[0] ?? "მესაკუთრე";

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="flex items-center gap-2 text-[36px] font-black leading-[44px] text-[#0F172A]">
          გამარჯობა, {firstName}
          <span aria-hidden className="text-[30px]">
            👋
          </span>
        </h1>
        <p className="text-[14px] font-medium text-[#64748B]">
          თქვენი სეზონური სანქციორო აქტიურია{" "}
          <strong className="font-extrabold text-[#0F172A]">15 მარტამდე</strong>
          .
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="თვის შემოსავალი"
          value={formatPrice(Number(monthlyIncome))}
          change={null}
          loading={loading}
          valueColor="default"
        />
        <StatCard
          label="მისაღები (ვალი)"
          value={formatPrice(Number(receivable))}
          change={null}
          loading={loading}
          valueColor="warning"
        />
        <StatCard
          label="დატვირთულობა"
          value={`${occupancy}%`}
          change={null}
          loading={loading}
          valueColor="success"
        />
        <StatCard
          label="პროფილის ნახვები"
          value={totalViews}
          change={totalViews > 0 ? 12 : null}
          loading={loading}
          valueColor="accent"
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
            ჩემი ობიექტები
          </h2>
          <Link
            href="/create/rental"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            ახალი ბინა
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
                  onPay={() =>
                    setPaymentModal({
                      open: true,
                      status: "pending",
                      title: property.title,
                    })
                  }
                  onViewPaid={() =>
                    setPaymentModal({
                      open: true,
                      status: "paid",
                      title: property.title,
                    })
                  }
                  onOpenTier={(tier) => setPickerModal({ open: true, tier })}
                />
              );
            })}

          {!loading && properties.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E2E8F0] bg-white py-14 text-center">
              <AlertTriangle className="h-10 w-10 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#64748B]">
                ობიექტები ვერ მოიძებნა
              </p>
              <Link
                href="/create/rental"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#1E40AF]"
              >
                <Plus className="h-4 w-4" />
                ახალი ბინა
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      <PaymentModal
        isOpen={paymentModal.open}
        onClose={() => setPaymentModal((p) => ({ ...p, open: false }))}
        status={paymentModal.status}
        amount={30}
        propertyTitle={paymentModal.title}
        dueDate={
          paymentModal.status === "pending"
            ? "15 აპრილი, 2026"
            : "15 მაისი, 2026"
        }
      />

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
        }))}
        onConfirm={async (propertyId) => {
          await supabase.functions.invoke("purchase-vip", {
            body: {
              purchase_type:
                pickerModal.tier === "super-vip"
                  ? "super_vip"
                  : pickerModal.tier === "vip"
                    ? "vip_boost"
                    : pickerModal.tier === "discount"
                      ? "discount_badge"
                      : "sms_package",
              days: 1,
              property_id: propertyId,
            },
          });
        }}
      />
    </div>
  );
}

function PropertyRow({
  property,
  statusKey,
  isBlocked,
  onPay,
  onViewPaid,
  onOpenTier,
}: {
  property: Property;
  statusKey: string;
  isBlocked: boolean;
  onPay: () => void;
  onViewPaid: () => void;
  onOpenTier: (tier: VipInfoTier) => void;
}) {
  const photo = (property.photos ?? [])[0];
  const isPaid = statusKey === "active";

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
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[#94A3B8]">
            <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 font-bold text-[#16A34A]">
              ID: {propertyShortId(property.id)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusDotColor[statusKey] ?? ""}`}
              />
              <span
                className={`text-[11px] font-bold ${statusTextColor[statusKey] ?? ""}`}
              >
                {statusLabels[statusKey] ?? statusKey}
              </span>
            </span>
            {!isBlocked && (
              <span>ნახვები: {formatViews(property.views_count ?? 0)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {!isBlocked && (
            <button
              type="button"
              onClick={isPaid ? onViewPaid : onPay}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 text-[12px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
            >
              <CreditCard className="h-3.5 w-3.5" />
              საწევრო
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Pencil className="h-3.5 w-3.5" />
            რედაქტირება
          </button>
        </div>
      </div>

      {/* Promo tier row */}
      {!isBlocked && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-4">
          <span className="mr-auto text-[12px] font-semibold text-[#64748B]">
            განცხადების დაწინაურება:
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
            ფასდაკლება
          </button>
        </div>
      )}
    </motion.div>
  );
}
