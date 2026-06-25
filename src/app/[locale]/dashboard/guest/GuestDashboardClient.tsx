"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Eye, Plus, Star } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import NewRequestModal, {
  type NewRequestPayload,
} from "@/components/guest/NewRequestModal";
import GuestOffersModal, {
  type GuestOffer,
} from "@/components/guest/GuestOffersModal";
import type { Tables } from "@/lib/types/database";
import { isStale } from "@/lib/smart-match/match";
import MyRequestCard from "@/components/guest/MyRequestCard";
import { loadGuestData, type GuestData, type MyRequest } from "./loadData";

type Property = Tables<"properties">;

export default function GuestDashboardClient({
  userId,
  initial,
}: {
  userId: string;
  initial: GuestData;
}) {
  const t = useTranslations("GuestDashboard");
  const tNewReq = useTranslations("GuestDashboard.newRequestModal");
  const locale = useLocale();
  const supabase = createClient();

  const todayISO = new Date().toISOString().slice(0, 10);
  const allZonesLabel = tNewReq("allZones");

  // Seeded from the server render — content is present on first paint, so there
  // is no loading skeleton on initial load. Realtime updates refresh silently.
  const [loading] = useState(false);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(
    initial.profile,
  );
  const [recent, setRecent] = useState<Property[]>(initial.recent);
  const [offers, setOffers] = useState<GuestOffer[]>(initial.offers);
  const [reviewRequests, setReviewRequests] = useState<
    Tables<"notifications">[]
  >(initial.reviewRequests);
  const [requests, setRequests] = useState<MyRequest[]>(initial.requests);

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);

  const pendingOffers = offers.filter((o) => o.status === "pending");
  const newOfferCount = pendingOffers.length;

  const apply = useCallback((data: GuestData) => {
    setProfile(data.profile);
    setRecent(data.recent);
    setOffers(data.offers);
    setReviewRequests(data.reviewRequests);
    setRequests(data.requests);
  }, []);

  useEffect(() => {
    // Realtime: refresh offers when new ones land
    const channel = supabase
      .channel("guest-dashboard-offers")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "smart_match_offers",
        },
        () => {
          loadGuestData(supabase, userId).then(apply);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const firstName = profile?.display_name?.split(" ")[0] ?? t("defaultName");

  async function handleSubmitNewRequest(payload: NewRequestPayload) {
    const zoneValue = payload.zone === "all" ? null : payload.zone;

    // Create the request. A DB trigger (notify_owners_of_smart_match_request)
    // fans out notifications to every matching renter server-side, so there is no
    // fragile client-side fan-out here.
    const { error } = await supabase.from("smart_match_requests").insert({
      guest_id: userId,
      check_in: payload.checkIn,
      check_out: payload.checkOut,
      guests_count: payload.guestsCount ?? null,
      budget_min: payload.budgetMin ?? null,
      budget_max: payload.budgetMax ?? null,
      zone: zoneValue,
      status: "active",
    });
    // Throw so NewRequestModal stays open and shows the failure instead of
    // closing with apparent success.
    if (error) throw error;
    // Surface the new request immediately in "My Requests". The realtime channel
    // only listens on smart_match_offers, so a fresh request wouldn't otherwise
    // appear until an offer lands.
    apply(await loadGuestData(supabase, userId));
  }

  async function handleCancelRequest(requestId: string) {
    // Optimistic — flip to cancelled, revert if the update fails. Sets status
    // rather than deleting (non-destructive); the renter inbox filters on
    // status = 'active', so a cancelled request disappears there automatically.
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "cancelled" } : r)),
    );
    const { error } = await supabase
      .from("smart_match_requests")
      .update({ status: "cancelled" })
      .eq("id", requestId);
    if (error) {
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: "active" } : r)),
      );
    }
  }

  async function handleDeclineOffer(offerId: string) {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId ? { ...o, status: "declined" as const } : o,
      ),
    );
    await supabase
      .from("smart_match_offers")
      .update({ status: "declined" })
      .eq("id", offerId);
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {t("welcome", { name: firstName })}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewRequestOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0F8F60] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52]"
        >
          <Plus className="h-4 w-4" />
          {t("newRequest")}
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F8F60] to-[#0B7A52] px-6 py-6 text-white shadow-[0px_10px_30px_-8px_rgba(15,143,96,0.35)] sm:px-8"
      >
        <span className="inline-flex rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
          SMART MATCH AI
        </span>
        <h2 className="mt-3 text-[22px] font-black leading-[28px]">
          {newOfferCount > 0
            ? t("offersTitleNew", { count: newOfferCount })
            : t("offersTitleEmpty")}
        </h2>
        <p className="mt-1.5 max-w-xl text-[13px] font-medium text-white/80">
          {newOfferCount > 0 ? t("offersDescNew") : t("offersDescEmpty")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {newOfferCount > 0 ? (
            <button
              type="button"
              onClick={() => setOffersOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5"
            >
              {t("viewOffers")}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setNewRequestOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5"
            >
              {t("sendRequest")}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07 }}
      >
        <h2 className="text-[18px] font-black text-[#0F172A]">
          {t("myRequests.title")}
        </h2>
        {requests.length === 0 ? (
          <p className="mt-3 rounded-[20px] border border-[#EEF1F4] bg-[#FAFBFC] px-5 py-8 text-center text-[13px] font-medium text-[#94A3B8]">
            {t("myRequests.empty")}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {requests.map((r) => (
              <MyRequestCard
                key={r.id}
                request={r}
                locale={locale}
                allZonesLabel={allZonesLabel}
                expired={isStale(r, todayISO)}
                onCancel={handleCancelRequest}
              />
            ))}
          </div>
        )}
      </motion.section>

      {reviewRequests.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="overflow-hidden rounded-[20px] border border-[#FED7AA] bg-[#FFF7ED] p-5"
        >
          <div className="flex items-center gap-2">
            <Star
              className="h-5 w-5 text-[#F97316]"
              fill="#F97316"
              strokeWidth={0}
            />
            <h2 className="text-[15px] font-black text-[#0F172A]">
              {t("pendingReviews", { count: reviewRequests.length })}
            </h2>
          </div>
          <p className="mt-1 text-[12px] font-medium text-[#92400E]">
            {t("pendingReviewsHint")}
          </p>
          <ul className="mt-4 space-y-2">
            {reviewRequests.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.action_url ?? "/dashboard/guest"}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#FFFBEB]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-[#0F172A]">
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                        {n.message}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-[#F97316]">
                    {t("review")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-black text-[#0F172A]">
              {t("recentTitle")}
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
              {t("recentSubtitle")}
            </p>
          </div>
          <Link
            href="/apartments"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[#0F8F60] hover:underline"
          >
            {t("viewAll")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[260px] rounded-[20px]" />
              ))
            : recent.map((p) => (
                <Link
                  key={p.id}
                  href={
                    p.is_for_sale ? `/sales/${p.id}` : `/apartments/${p.id}`
                  }
                  className="group flex flex-col overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]"
                >
                  <div className="relative h-[150px] w-full overflow-hidden bg-[#F1F5F9]">
                    {(p.photos ?? [])[0] && (
                      <Image
                        src={(p.photos ?? [])[0]}
                        alt={p.title}
                        fill
                        sizes="400px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    {p.is_vip && (
                      <span className="absolute left-3 top-3 rounded-md bg-[#F97316] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                        VIP
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
                      {p.title}
                    </h3>
                    <p className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
                      <Eye className="h-3 w-3" />
                      {t("views", { count: p.views_count ?? 0 })}
                    </p>
                    <div className="mt-auto flex items-baseline gap-1 pt-2">
                      <span className="text-[16px] font-black text-[#0F172A]">
                        {formatPrice(Number(p.price_per_night ?? 0))}
                      </span>
                      <span className="text-[11px] font-medium text-[#94A3B8]">
                        {t("perNight")}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </motion.section>

      <NewRequestModal
        isOpen={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        onSubmit={handleSubmitNewRequest}
      />
      <GuestOffersModal
        isOpen={offersOpen}
        onClose={() => setOffersOpen(false)}
        offers={pendingOffers}
        onDecline={handleDeclineOffer}
      />
    </div>
  );
}
