"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Star,
  MapPin,
  Megaphone,
  Sparkles,
  Calendar,
  Plus,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import NewRequestModal, {
  type NewRequestPayload,
} from "@/components/guest/NewRequestModal";
import type { Tables } from "@/lib/types/database";

type Property = Tables<"properties">;
type Owner = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "avatar_url" | "rating" | "phone"
>;

interface OfferView {
  offerId: string;
  requestId: string;
  property: Property;
  owner: Owner | null;
  checkIn: string | null;
  checkOut: string | null;
  offeredPrice: number;
  status: "pending" | "declined" | "accepted";
  isNew: boolean;
  createdAt: string | null;
}

type TabKey = "all" | "new";

export default function GuestBookingsPage() {
  const t = useTranslations("GuestBookings");
  const { user } = useAuth();
  const supabase = createClient();
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function fetchData() {
      const { data } = await supabase
        .from("smart_match_offers")
        .select(
          "*, smart_match_requests!inner(id, guest_id, check_in, check_out), properties(*)",
        )
        .eq("smart_match_requests.guest_id", user!.id)
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        if (active) setLoading(false);
        return;
      }

      const ownerIds = Array.from(
        new Set(
          data
            .map(
              (r) =>
                (r as unknown as { properties: { owner_id: string | null } })
                  .properties?.owner_id,
            )
            .filter((id): id is string => !!id),
        ),
      );

      const { data: ownerData } =
        ownerIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, display_name, avatar_url, rating, phone")
              .in("id", ownerIds)
          : { data: [] as Owner[] };

      const ownerMap = new Map(
        ((ownerData as Owner[]) ?? []).map((o) => [o.id, o]),
      );

      const rows: OfferView[] = data
        .map((r) => {
          const row = r as unknown as {
            id: string;
            offered_price: number;
            status: "pending" | "declined" | "accepted";
            created_at: string | null;
            smart_match_requests: {
              id: string;
              check_in: string | null;
              check_out: string | null;
            };
            properties: Property;
          };
          const p = row.properties;
          if (!p) return null;
          return {
            offerId: row.id,
            requestId: row.smart_match_requests.id,
            property: p,
            owner: p.owner_id ? (ownerMap.get(p.owner_id) ?? null) : null,
            checkIn: row.smart_match_requests.check_in,
            checkOut: row.smart_match_requests.check_out,
            offeredPrice: Number(row.offered_price),
            status: row.status,
            isNew: row.status === "pending",
            createdAt: row.created_at,
          } satisfies OfferView;
        })
        .filter((o): o is OfferView => o !== null);

      if (active) {
        setOffers(rows);
        setLoading(false);
      }

      // Mark pending offers as seen
      const pendingIds = rows
        .filter((o) => o.status === "pending")
        .map((o) => o.offerId);
      if (pendingIds.length > 0) {
        await supabase
          .from("smart_match_offers")
          .update({ guest_seen: true })
          .in("id", pendingIds);
      }
    }
    fetchData();

    // Live: new/updated offers for this guest arrive over websocket. RLS scopes
    // smart_match_offers to the guest's own requests, so we refetch on any change.
    const channel = supabase
      .channel("guest-bookings-offers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "smart_match_offers" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(
    () => (tab === "new" ? offers.filter((o) => o.isNew) : offers),
    [offers, tab],
  );
  const newCount = offers.filter((o) => o.isNew).length;

  async function submitNewRequest(p: NewRequestPayload) {
    // Throwing keeps NewRequestModal open with an error instead of closing
    // with apparent success.
    if (!user) throw new Error("Not authenticated");
    const zoneValue = p.zone === "all" ? null : p.zone;

    // Create the request. A DB trigger (notify_owners_of_smart_match_request)
    // fans out notifications to every matching renter server-side, so there is no
    // fragile client-side fan-out here.
    const { error } = await supabase.from("smart_match_requests").insert({
      guest_id: user.id,
      check_in: p.checkIn,
      check_out: p.checkOut,
      guests_count: p.guestsCount ?? null,
      budget_min: p.budgetMin ?? null,
      budget_max: p.budgetMax ?? null,
      zone: zoneValue,
      status: "active",
    });
    if (error) throw error;
  }

  async function declineOffer(offerId: string) {
    setOffers((prev) =>
      prev.map((o) =>
        o.offerId === offerId ? { ...o, status: "declined", isNew: false } : o,
      ),
    );
    await supabase
      .from("smart_match_offers")
      .update({ status: "declined" })
      .eq("id", offerId);
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0F8F60] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52]"
        >
          <Plus className="h-4 w-4" />
          {t("newRequest")}
        </button>
      </motion.div>

      <div className="flex items-center gap-2">
        {[
          { key: "all" as const, label: t("tabAll", { count: offers.length }) },
          { key: "new" as const, label: t("tabNew", { count: newCount }) },
        ].map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => setTab(tabItem.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
              tab === tabItem.key
                ? "bg-[#0F8F60] text-white"
                : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0F8F60] hover:text-[#0F8F60]"
            }`}
          >
            {tabItem.key === "new" && <Sparkles className="h-3.5 w-3.5" />}
            {tabItem.label}
          </button>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-[20px]" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <Megaphone className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-[14px] font-bold text-[#0F172A]">
              {t("emptyTitle")}
            </p>
            <p className="mt-1 text-[12px] text-[#94A3B8]">{t("emptyDesc")}</p>
          </div>
        ) : (
          filtered.map((o) => (
            <OfferCard
              key={o.offerId}
              offer={o}
              onDecline={() => declineOffer(o.offerId)}
            />
          ))
        )}
      </motion.div>

      <NewRequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={submitNewRequest}
      />
    </div>
  );
}

function OfferCard({
  offer,
  onDecline,
}: {
  offer: OfferView;
  onDecline: () => void;
}) {
  const t = useTranslations("GuestBookings");
  const ownerName = offer.owner?.display_name ?? t("defaultOwner");
  const initials = ownerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const photo = (offer.property.photos ?? [])[0] ?? null;
  const listingPrice = Number(offer.property.price_per_night ?? 0);
  const isCheaper = offer.offeredPrice < listingPrice && listingPrice > 0;

  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-[#DBEAFE] text-[12px] font-extrabold text-[#2563EB]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {ownerName}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B]">
            <span>{t("ownerRole")}</span>
            {offer.owner?.rating != null && (
              <>
                <span className="text-[#CBD5E1]">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Star
                    className="h-3 w-3 text-[#F59E0B]"
                    fill="currentColor"
                  />
                  {Number(offer.owner.rating).toFixed(1)}
                </span>
              </>
            )}
          </p>
        </div>
        {offer.isNew && (
          <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#16A34A]">
            {t("badgeNew")}
          </span>
        )}
        {offer.status === "declined" && (
          <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#DC2626]">
            {t("badgeDeclined")}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="relative h-[92px] w-full overflow-hidden rounded-xl bg-[#F1F5F9] sm:w-[140px] sm:shrink-0">
          {photo && (
            <Image
              src={photo}
              alt={offer.property.title}
              fill
              sizes="140px"
              className="object-cover"
            />
          )}
          {offer.property.is_vip && (
            <span className="absolute left-2 top-2 rounded-md bg-[#F97316] px-2 py-0.5 text-[9px] font-black uppercase text-white">
              VIP
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold text-[#0F172A]">
            {offer.property.title}
          </h3>
          {offer.property.location && (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-[#64748B]">
              <MapPin className="h-3.5 w-3.5" />
              {offer.property.location}
            </p>
          )}
          {(offer.checkIn || offer.checkOut) && (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-[#64748B]">
              <Calendar className="h-3.5 w-3.5" />
              {offer.checkIn ?? "—"} → {offer.checkOut ?? "—"}
            </p>
          )}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                {t("offeredPrice")}
              </span>
              <p className="text-[20px] font-black text-[#0F172A]">
                {formatPrice(offer.offeredPrice)}{" "}
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  {t("perNight")}
                </span>
              </p>
              {isCheaper && (
                <p className="mt-0.5 text-[10px] font-bold text-[#10B981]">
                  {t("cheaper", { price: listingPrice })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {offer.status === "pending" && (
                <button
                  type="button"
                  onClick={onDecline}
                  className="h-10 rounded-xl border border-[#E2E8F0] px-4 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
                >
                  {t("decline")}
                </button>
              )}
              <Link
                href={
                  offer.property.is_for_sale
                    ? `/sales/${offer.property.id}`
                    : `/apartments/${offer.property.id}`
                }
                className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#2563EB] px-4 text-[12px] font-bold text-white hover:bg-[#1D4ED8]"
              >
                {t("viewDetails")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
