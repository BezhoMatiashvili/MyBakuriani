"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Home, Inbox } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import SmartMatchRequestsModal, {
  type SmartMatchRequestItem,
  type OwnerProperty,
} from "@/components/renter/SmartMatchRequestsModal";
import SentOfferCard, {
  type SentOffer,
} from "@/components/renter/SentOfferCard";
import { useActiveZones } from "@/lib/zones/client";
import {
  isStale,
  resolvePropertyZoneName,
  scoreRequest,
  type MatchProperty,
  type MatchRequest,
} from "@/lib/smart-match/match";
import { formatRelativeTime } from "@/lib/i18n/relativeTime";
import type { Tables } from "@/lib/types/database";

type SmartMatchRequest = Tables<"smart_match_requests"> & {
  profiles: Pick<
    Tables<"profiles">,
    "display_name" | "phone" | "avatar_url"
  > | null;
};

const SENT_OFFER_SELECT =
  "*, properties(title), smart_match_requests(zone, check_in, check_out, budget_min, budget_max, guests_count, profiles(display_name))";

function shortRequestId(id: string) {
  return `REQ-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function toMatchRequest(r: SmartMatchRequest): MatchRequest {
  return {
    zone: r.zone,
    budgetMin: r.budget_min != null ? Number(r.budget_min) : null,
    budgetMax: r.budget_max != null ? Number(r.budget_max) : null,
    guestsCount: r.guests_count ?? null,
    checkIn: r.check_in,
    checkOut: r.check_out,
  };
}

function postedAgo(
  t: ReturnType<typeof useTranslations<"DashboardShared">>,
  iso: string | null,
): string {
  if (!iso) return t("timeJustNow");
  return formatRelativeTime(t, iso);
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

function formatDates(
  tSchedule: ReturnType<typeof useTranslations<"CleanerSchedule">>,
  checkIn: string | null,
  checkOut: string | null,
): string {
  if (!checkIn && !checkOut) return "—";
  const fmt = (d: string | null) => {
    if (!d) return "?";
    const [, m, day] = d.split("-");
    const monthKey = MONTH_KEYS[parseInt(m, 10) - 1];
    return `${parseInt(day, 10)} ${tSchedule(`monthsShort.${monthKey}`)}`;
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

export default function RenterSmartMatchPage() {
  const t = useTranslations("RenterSmartMatch");
  const tShared = useTranslations("DashboardShared");
  const tSchedule = useTranslations("CleanerSchedule");
  const tModal = useTranslations("SmartMatchModal");
  const { user } = useAuth();
  const supabase = createClient();
  const { zones: activeZones } = useActiveZones();

  const [requests, setRequests] = useState<SmartMatchRequest[]>([]);
  const [ownerProperties, setOwnerProperties] = useState<OwnerProperty[]>([]);
  const [ownerMatchProps, setOwnerMatchProps] = useState<MatchProperty[]>([]);
  const [ownerZones, setOwnerZones] = useState<Set<string>>(new Set());
  const [submittedRequestIds, setSubmittedRequestIds] = useState<Set<string>>(
    new Set(),
  );
  const [sentOffers, setSentOffers] = useState<SentOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [noActiveListings, setNoActiveListings] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      // Opening Smart Match clears the sidebar "new requests" badge: mark this
      // renter's unread request notifications as read. DashboardShell recomputes
      // the badge from this via realtime.
      void supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("type", "smart_match_request")
        .eq("is_read", false);

      setLoadError(false);
      setNoActiveListings(false);

      const { data: properties, error: propertiesError } = await supabase
        .from("properties")
        .select(
          "id, title, price_per_night, capacity, location, location_lat, location_lng",
        )
        .eq("owner_id", user!.id)
        .eq("status", "active")
        .eq("is_for_sale", false);

      // A failed query must not render as "no requests" — surface it.
      if (propertiesError) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      // Requests are gated (page + RLS + fan-out trigger) on owning at least
      // one active non-sale listing — explain that instead of a generic empty.
      if (!properties || properties.length === 0) {
        setNoActiveListings(true);
        setLoading(false);
        return;
      }

      // Resolve each property's zone from location text + sane coords. A null
      // zone means "unknown" and acts as a wildcard (fail-open) downstream.
      const matchProps: MatchProperty[] = properties.map((p) => ({
        id: p.id,
        zoneName: resolvePropertyZoneName(
          activeZones,
          p.location,
          p.location_lat != null ? Number(p.location_lat) : null,
          p.location_lng != null ? Number(p.location_lng) : null,
        ),
        price: Number(p.price_per_night ?? 0),
        capacity: p.capacity ?? null,
      }));
      setOwnerMatchProps(matchProps);

      // Zones the renter covers (resolved, non-null) — for the stat card.
      const zoneSet = new Set<string>();
      for (const mp of matchProps) {
        if (mp.zoneName) zoneSet.add(mp.zoneName);
      }
      setOwnerZones(zoneSet);

      setOwnerProperties(
        properties.map((p) => ({
          id: p.id,
          title: p.title,
          price: Number(p.price_per_night ?? 0),
        })),
      );

      // Fetch active requests and keep the fresh ones. Zone mismatches are NOT
      // hidden: property zones are often coord-derived guesses (seeded coords),
      // so scoreRequest only ranks them lower instead.
      const { data: reqData, error: reqError } = await supabase
        .from("smart_match_requests")
        .select("*, profiles(display_name, phone, avatar_url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(30);

      if (reqError) {
        setLoadError(true);
      } else if (reqData) {
        const today = new Date().toISOString().slice(0, 10);
        const filtered = (reqData as SmartMatchRequest[]).filter(
          (r) => !isStale(toMatchRequest(r), today),
        );
        setRequests(filtered);
      }

      // All offers this renter has ever sent — drives both the "responded"
      // set (below) and the sent-offers list. Unconditional: unlike `requests`
      // above (limited to currently-active ones), a sent offer stays visible
      // even after its target request goes stale/matched/cancelled.
      const { data: offersData, error: offersError } = await supabase
        .from("smart_match_offers")
        .select(SENT_OFFER_SELECT)
        .eq("renter_id", user!.id)
        .order("created_at", { ascending: false });

      if (offersError) {
        setLoadError(true);
      } else if (offersData) {
        const offers = offersData as unknown as SentOffer[];
        setSentOffers(offers);
        // Merge, don't replace: a reseed racing a just-sent offer (this tab
        // or another) must not wipe its id — offers are never deleted, so
        // ids only ever become true.
        setSubmittedRequestIds(
          (prev) => new Set([...prev, ...offers.map((o) => o.request_id)]),
        );
      }

      setLoading(false);
    }

    fetchData();

    const channel = supabase
      .channel("smart-match-inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "smart_match_offers",
        },
        (payload) => {
          // Keeps the "responded" state live across tabs/devices without a
          // refetch. RLS (renter_read_own_offers) already scopes delivery to
          // this renter's offers; the guard is defensive.
          const offer = payload.new as {
            id?: string;
            renter_id?: string;
            request_id?: string;
          };
          if (offer.renter_id === user!.id && offer.request_id) {
            const offerRequestId = offer.request_id;
            setSubmittedRequestIds((prev) => new Set(prev).add(offerRequestId));
          }
          // Fetch just this row's embedded details for the sent-offers list —
          // avoids a full fetchData() refetch for a single new offer.
          if (offer.renter_id === user!.id && offer.id) {
            supabase
              .from("smart_match_offers")
              .select(SENT_OFFER_SELECT)
              .eq("id", offer.id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setSentOffers((prev) => [
                    data as unknown as SentOffer,
                    ...prev,
                  ]);
                }
              });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "smart_match_requests",
        },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const modalRequests: SmartMatchRequestItem[] = useMemo(() => {
    const scored = requests.map((r) => {
      const guestName = r.profiles?.display_name ?? tShared("defaultGuest");
      const initials = guestName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const mreq = toMatchRequest(r);
      const { matchPercent, belowOwnerPrice, capacityShort } = scoreRequest(
        mreq,
        ownerMatchProps,
      );
      const clientBudget = Number(r.budget_max ?? r.budget_min ?? 0);
      const item: SmartMatchRequestItem & { _dbId: string } = {
        id: shortRequestId(r.id),
        guestName,
        initials: initials || "?",
        postedAgo: postedAgo(tShared, r.created_at),
        matchPercent,
        zone: r.zone ?? t("allZones"),
        dates: formatDates(tSchedule, r.check_in, r.check_out),
        guests: r.guests_count
          ? t("guestsCount", { count: r.guests_count })
          : "—",
        clientBudget,
        belowOwnerPrice,
        capacityShort,
        responded: submittedRequestIds.has(r.id),
        // Keep real DB id for submission via a side channel
        _dbId: r.id,
      };
      return { item, score: matchPercent, createdAt: r.created_at };
    });

    // Best matches first, then most recent. Responded cards keep their rank
    // position so the card the user just answered doesn't teleport away from
    // under their cursor — its green "sent" panel shows in place instead.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
    return scored.map((s) => s.item);
  }, [requests, submittedRequestIds, ownerMatchProps, t, tShared, tSchedule]);

  async function handleSubmitOffer({
    requestId,
    propertyId,
    offeredPrice,
  }: {
    requestId: string;
    propertyId: string;
    offeredPrice: number;
  }): Promise<boolean> {
    if (!user) return false;
    // Look up the real DB id by short id
    const requestRow = modalRequests.find((r) => r.id === requestId) as
      (SmartMatchRequestItem & { _dbId: string }) | undefined;
    const realRequestId = requestRow?._dbId ?? requestId;

    const guestRequest = requests.find((r) => r.id === realRequestId);
    if (!guestRequest) return false;

    const { error } = await supabase.from("smart_match_offers").insert({
      request_id: realRequestId,
      renter_id: user.id,
      property_id: propertyId,
      offered_price: offeredPrice,
      status: "pending",
    });

    if (error) {
      // Duplicate (request_id, property_id) means an offer already exists —
      // treat it as sent instead of failing.
      if (error.code === "23505") {
        setSubmittedRequestIds((prev) => new Set(prev).add(realRequestId));
        return true;
      }
      console.error("Failed to submit offer", error);
      toast.error(tModal("offerError"));
      return false;
    }

    // The guest is notified server-side by the notify_guest_of_smart_match_offer
    // trigger that fires on the insert above.
    setSubmittedRequestIds((prev) => new Set(prev).add(realRequestId));
    return true;
  }

  // Responded cards stay visible in the modal; only unanswered ones count as
  // "incoming" for the stat and banner. "Sent" counts responded cards within
  // the same visible window so the two stats always add up.
  const actionableCount = modalRequests.filter((r) => !r.responded).length;
  const respondedCount = modalRequests.length - actionableCount;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          Smart Match
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: t("statIncoming"),
            value: actionableCount,
            color: "bg-green-100 text-green-600",
          },
          {
            label: t("statSent"),
            value: respondedCount,
            color: "bg-brand-accent-light text-brand-accent",
          },
          {
            label: t("statZones"),
            value: ownerZones.size,
            color: "bg-purple-100 text-purple-600",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <p className="text-xs text-[#94A3B8]">{stat.label}</p>
            <div className="mt-1 text-2xl font-bold text-[#1E293B]">
              {loading ? <Skeleton className="h-8 w-12" /> : stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-gradient-to-br from-[#0F204C] to-[#1E3A8A] p-6 text-white"
      >
        <span className="inline-block rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          SMART MATCH
        </span>
        <h2 className="mt-3 text-[24px] font-black leading-[30px]">
          {actionableCount > 0
            ? t("bannerNew", { count: actionableCount })
            : modalRequests.length > 0
              ? t("bannerAllAnswered")
              : t("bannerEmpty")}
        </h2>
        <p className="mt-2 max-w-xl text-[13px] font-medium text-white/80">
          {t("bannerDesc")}
        </p>
        <button
          type="button"
          disabled={modalRequests.length === 0}
          onClick={() => setModalOpen(true)}
          className="mt-5 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {t("viewRequests")}
        </button>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-[18px] font-black text-[#0F172A]">
          {t("sentOffersTitle")}
        </h2>
        {loading ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-[20px]" />
            ))}
          </div>
        ) : sentOffers.length === 0 ? (
          <p className="mt-3 rounded-[20px] border border-[#EEF1F4] bg-[#FAFBFC] px-5 py-8 text-center text-[13px] font-medium text-[#94A3B8]">
            {t("sentOffersEmpty")}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sentOffers.map((offer) => (
              <SentOfferCard
                key={offer.id}
                offer={offer}
                allZonesLabel={t("allZones")}
              />
            ))}
          </div>
        )}
      </motion.section>

      {!loading && loadError && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#FECACA] bg-[#FEF2F2] py-16 text-center">
          <AlertTriangle className="h-12 w-12 text-[#DC2626]" />
          <p className="mt-3 px-6 text-sm font-bold text-[#991B1B]">
            {t("loadError")}
          </p>
        </div>
      )}

      {!loading && !loadError && noActiveListings && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white px-6 py-16 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <Home className="h-12 w-12 text-[#94A3B8]" />
          <p className="mt-3 text-[15px] font-extrabold text-[#0F172A]">
            {t("needActiveTitle")}
          </p>
          <p className="mt-1 max-w-md text-[13px] font-medium text-[#64748B]">
            {t("needActiveDesc")}
          </p>
          <Link
            href="/dashboard/renter/listings"
            className="mt-5 rounded-xl bg-[#0F8F60] px-5 py-2.5 text-[13px] font-black text-white transition-colors hover:bg-[#0B7A52]"
          >
            {t("needActiveCta")}
          </Link>
        </div>
      )}

      {!loading &&
        !loadError &&
        !noActiveListings &&
        modalRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
            <Inbox className="h-12 w-12 text-[#94A3B8]" />
            <p className="mt-3 text-sm text-[#94A3B8]">{t("empty")}</p>
          </div>
        )}

      <SmartMatchRequestsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        requests={modalRequests}
        ownerProperties={ownerProperties}
        onSubmitOffer={handleSubmitOffer}
      />
    </div>
  );
}
