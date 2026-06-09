"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import SmartMatchRequestsModal, {
  type SmartMatchRequestItem,
  type OwnerProperty,
} from "@/components/renter/SmartMatchRequestsModal";
import { useActiveZones } from "@/lib/zones/client";
import {
  isCompatible,
  isStale,
  resolvePropertyZoneName,
  scoreRequest,
  type MatchProperty,
  type MatchRequest,
} from "@/lib/smart-match/match";
import type { Tables } from "@/lib/types/database";

type SmartMatchRequest = Tables<"smart_match_requests"> & {
  profiles: Pick<
    Tables<"profiles">,
    "display_name" | "phone" | "avatar_url"
  > | null;
};

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

function postedAgo(iso: string | null): string {
  if (!iso) return "ახლახან";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "ახლახან";
  if (hours < 24) return `${hours} სთ-ის წინ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "გუშინ";
  return `${days} დღის წინ`;
}

function formatDates(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn && !checkOut) return "—";
  const fmt = (d: string | null) => {
    if (!d) return "?";
    const [, m, day] = d.split("-");
    return `${parseInt(day)} ${monthAbbr(parseInt(m))}`;
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

function monthAbbr(m: number): string {
  const months = [
    "იან",
    "თებ",
    "მარ",
    "აპრ",
    "მაი",
    "ივნ",
    "ივლ",
    "აგვ",
    "სექ",
    "ოქტ",
    "ნოე",
    "დეკ",
  ];
  return months[m - 1] ?? "";
}

export default function RenterSmartMatchPage() {
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
  const [loading, setLoading] = useState(true);
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

      const { data: properties } = await supabase
        .from("properties")
        .select(
          "id, title, price_per_night, capacity, location, location_lat, location_lng",
        )
        .eq("owner_id", user!.id)
        .eq("status", "active")
        .eq("is_for_sale", false);

      if (!properties || properties.length === 0) {
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

      // Fetch active requests, then keep the fresh, zone-compatible ones.
      const { data: reqData } = await supabase
        .from("smart_match_requests")
        .select("*, profiles(display_name, phone, avatar_url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(30);

      if (reqData) {
        const today = new Date().toISOString().slice(0, 10);
        const filtered = (reqData as SmartMatchRequest[]).filter((r) => {
          const mreq = toMatchRequest(r);
          return !isStale(mreq, today) && isCompatible(mreq, matchProps);
        });
        setRequests(filtered);

        // Mark requests this renter has already submitted offers on
        const propIds = properties.map((p) => p.id);
        if (propIds.length > 0 && filtered.length > 0) {
          const { data: existingOffers } = await supabase
            .from("smart_match_offers")
            .select("request_id")
            .eq("renter_id", user!.id)
            .in(
              "request_id",
              filtered.map((r) => r.id),
            );
          if (existingOffers) {
            setSubmittedRequestIds(
              new Set(existingOffers.map((o) => o.request_id)),
            );
          }
        }
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
    const scored = requests
      .filter((r) => !submittedRequestIds.has(r.id))
      .map((r) => {
        const guestName = r.profiles?.display_name ?? "სტუმარი";
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
          postedAgo: postedAgo(r.created_at),
          matchPercent,
          zone: r.zone ?? "ყველა",
          dates: formatDates(r.check_in, r.check_out),
          guests: r.guests_count ? `${r.guests_count} სტუმარი` : "—",
          clientBudget,
          belowOwnerPrice,
          capacityShort,
          // Keep real DB id for submission via a side channel
          _dbId: r.id,
        };
        return { item, score: matchPercent, createdAt: r.created_at };
      });

    // Best matches first, then most recent.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
    return scored.map((s) => s.item);
  }, [requests, submittedRequestIds, ownerMatchProps]);

  async function handleSubmitOffer({
    requestId,
    propertyId,
    offeredPrice,
  }: {
    requestId: string;
    propertyId: string;
    offeredPrice: number;
  }) {
    if (!user) return;
    // Look up the real DB id by short id
    const requestRow = modalRequests.find((r) => r.id === requestId) as
      | (SmartMatchRequestItem & { _dbId: string })
      | undefined;
    const realRequestId = requestRow?._dbId ?? requestId;

    const guestRequest = requests.find((r) => r.id === realRequestId);
    if (!guestRequest) return;

    const { error } = await supabase.from("smart_match_offers").insert({
      request_id: realRequestId,
      renter_id: user.id,
      property_id: propertyId,
      offered_price: offeredPrice,
      status: "pending",
    });

    if (error) {
      console.error("Failed to submit offer", error);
      return;
    }

    // The guest is notified server-side by the notify_guest_of_smart_match_offer
    // trigger that fires on the insert above.
    setSubmittedRequestIds((prev) => new Set(prev).add(realRequestId));
  }

  const incomingCount = modalRequests.length;

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
          სტუმრების მოთხოვნები რომლებიც შეესატყვისება თქვენს ობიექტებს
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "შემოსავალი მოთხოვნები",
            value: incomingCount,
            color: "bg-green-100 text-green-600",
          },
          {
            label: "გაგზავნილი შეთავაზებები",
            value: submittedRequestIds.size,
            color: "bg-brand-accent-light text-brand-accent",
          },
          {
            label: "თქვენი ზონები",
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
          {incomingCount > 0
            ? `${incomingCount} ახალი მოთხოვნა თქვენი ზონისთვის`
            : "ჯერ არ არის შემოსავალი მოთხოვნები"}
        </h2>
        <p className="mt-2 max-w-xl text-[13px] font-medium text-white/80">
          ნახეთ სტუმრების მოთხოვნები და გაუგზავნეთ პერსონალური შეთავაზებები.
        </p>
        <button
          type="button"
          disabled={incomingCount === 0}
          onClick={() => setModalOpen(true)}
          className="mt-5 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          ნახე მოთხოვნები
        </button>
      </motion.div>

      {!loading && incomingCount === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <Inbox className="h-12 w-12 text-[#94A3B8]" />
          <p className="mt-3 text-sm text-[#94A3B8]">
            ახალი მოთხოვნები ჯერ არ არის
          </p>
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
