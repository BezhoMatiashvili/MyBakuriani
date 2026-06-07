"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Eye, Plus, Star } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import NewRequestModal, {
  type NewRequestPayload,
} from "@/components/guest/NewRequestModal";
import GuestOffersModal, {
  type GuestOffer,
} from "@/components/guest/GuestOffersModal";
import { useActiveZones } from "@/lib/zones/client";
import {
  isCompatible,
  resolvePropertyZoneName,
  type MatchProperty,
} from "@/lib/smart-match/match";
import type { Tables } from "@/lib/types/database";

type Property = Tables<"properties">;

function requestShortId(id: string) {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

export default function GuestDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [recent, setRecent] = useState<Property[]>([]);
  const [transportSvc, setTransportSvc] = useState<Tables<"services">[]>([]);
  const [offers, setOffers] = useState<GuestOffer[]>([]);
  const [reviewRequests, setReviewRequests] = useState<
    Tables<"notifications">[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);

  const pendingOffers = offers.filter((o) => o.status === "pending");
  const newOfferCount = pendingOffers.length;

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [profileRes, propsRes, svcRes, offersRes, reviewReqRes] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user!.id).single(),
          supabase
            .from("properties")
            .select("*")
            .eq("status", "active")
            .order("views_count", { ascending: false })
            .limit(3),
          supabase
            .from("services")
            .select("*")
            .in("category", ["transport", "entertainment"])
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(3),
          supabase
            .from("smart_match_offers")
            .select(
              "*, smart_match_requests!inner(id, guest_id), properties(id, title, photos, capacity, price_per_night, is_vip, numeric_rating, owner_id, profiles!owner_id(display_name, avatar_url, rating))",
            )
            .eq("smart_match_requests.guest_id", user!.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", user!.id)
            .eq("type", "review_request")
            .eq("is_read", false)
            .order("created_at", { ascending: false }),
        ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (propsRes.data) setRecent(propsRes.data);
      if (svcRes.data) setTransportSvc(svcRes.data);
      if (reviewReqRes.data) setReviewRequests(reviewReqRes.data);
      if (offersRes.data) {
        const mapped: GuestOffer[] = offersRes.data
          .map((row) => {
            const property = (
              row as unknown as {
                properties: {
                  id: string;
                  title: string;
                  photos: string[] | null;
                  capacity: number | null;
                  price_per_night: number | null;
                  is_vip: boolean | null;
                  numeric_rating: number | null;
                  profiles: {
                    display_name: string | null;
                    avatar_url: string | null;
                    rating: number | null;
                  } | null;
                } | null;
              }
            ).properties;
            const request = (
              row as unknown as {
                smart_match_requests: { id: string };
              }
            ).smart_match_requests;
            if (!property) return null;
            return {
              id: row.id,
              requestId: request.id,
              requestShortId: requestShortId(request.id),
              createdAt: row.created_at,
              offeredPrice: Number(row.offered_price),
              status: row.status as GuestOffer["status"],
              renter: {
                displayName: property.profiles?.display_name ?? "მფლობელი",
                avatarUrl: property.profiles?.avatar_url ?? null,
                rating: property.profiles?.rating ?? null,
                listingsCount: null,
              },
              property: {
                id: property.id,
                title: property.title,
                photo: (property.photos ?? [])[0] ?? null,
                rating: property.numeric_rating ?? null,
                capacity: property.capacity,
                pricePerNight: Number(property.price_per_night ?? 0),
                isVip: Boolean(property.is_vip),
              },
            } as GuestOffer;
          })
          .filter((o): o is GuestOffer => o !== null);
        setOffers(mapped);
      }
      setLoading(false);
    }
    fetchData();

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
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const firstName = profile?.display_name?.split(" ")[0] ?? "სტუმარი";

  async function handleSubmitNewRequest(payload: NewRequestPayload) {
    if (!user) return;
    const zoneValue = payload.zone === "all" ? null : payload.zone;

    // 1. Create the smart_match_request
    const { data: request, error: insertErr } = await supabase
      .from("smart_match_requests")
      .insert({
        guest_id: user.id,
        check_in: payload.checkIn,
        check_out: payload.checkOut,
        guests_count: payload.guestsCount ?? null,
        budget_min: payload.budgetMin ?? null,
        budget_max: payload.budgetMax ?? null,
        zone: zoneValue,
        status: "active",
      })
      .select()
      .single();

    if (insertErr || !request) return;

    // 2. Resolve every active rental property's zone and group by owner. The
    // same fail-open logic the renter inbox uses, so the notify set agrees with
    // what renters will actually see.
    const { data: properties } = await supabase
      .from("properties")
      .select(
        "id, owner_id, location, location_lat, location_lng, price_per_night, capacity",
      )
      .eq("status", "active")
      .eq("is_for_sale", false);

    if (!properties) return;

    const ownerProps = new Map<string, MatchProperty[]>();
    for (const p of properties) {
      if (!p.owner_id) continue;
      const list = ownerProps.get(p.owner_id) ?? [];
      list.push({
        id: p.id,
        zoneName: resolvePropertyZoneName(
          zones,
          p.location,
          p.location_lat != null ? Number(p.location_lat) : null,
          p.location_lng != null ? Number(p.location_lng) : null,
        ),
        price: Number(p.price_per_night ?? 0),
        capacity: p.capacity ?? null,
      });
      ownerProps.set(p.owner_id, list);
    }

    // 3. Notify owners whose listings are zone-compatible with this request.
    const uniqueOwners = Array.from(ownerProps.entries())
      .filter(([, props]) => isCompatible({ zone: zoneValue }, props))
      .map(([ownerId]) => ownerId);

    if (uniqueOwners.length > 0) {
      const datesStr =
        payload.checkIn && payload.checkOut
          ? `${payload.checkIn} – ${payload.checkOut}`
          : "";
      const zoneStr = zoneValue ?? "ბაკურიანი";
      await supabase.from("notifications").insert(
        uniqueOwners.map((ownerId) => ({
          user_id: ownerId,
          type: "smart_match_request",
          title: "ახალი Smart Match მოთხოვნა",
          message: `სტუმარი ეძებს ${zoneStr}-ში ${datesStr}`.trim(),
          action_url: "/dashboard/renter/smart-match",
        })),
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
            გამარჯობა, {firstName}, მზად ხარ დასვენებისთვის? 🏔️
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            აქ მოელის ახალი თავგადასავალი — ჯავშნები, შეთავაზებები და სერვისები
            ერთ სივრცეში.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewRequestOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0F8F60] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52]"
        >
          <Plus className="h-4 w-4" />
          ახალი მოთხოვნა
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
            ? `თქვენ გაქვთ ${newOfferCount} ახალი შეთავაზება!`
            : "გაგზავნე მოთხოვნა და მიიღე საუკეთესო შეთავაზებები"}
        </h2>
        <p className="mt-1.5 max-w-xl text-[13px] font-medium text-white/80">
          {newOfferCount > 0
            ? "მფლობელებმა გამოგზავნეს პერსონალური შეთავაზებები — შეადარე და აირჩიე საუკეთესო."
            : "დააფიქსირე სასურველი პირობები და მფლობელები პირდაპირ გამოგიგზავნიან შეთავაზებებს."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {newOfferCount > 0 ? (
            <button
              type="button"
              onClick={() => setOffersOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5"
            >
              შეთავაზებების ნახვა
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setNewRequestOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5"
            >
              მოთხოვნის გაგზავნა
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

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
              შეფასების მოლოდინში ({reviewRequests.length})
            </h2>
          </div>
          <p className="mt-1 text-[12px] font-medium text-[#92400E]">
            დასრულებული დარჩენების შესახებ მიმოხილვის დატოვება დაგვეხმარება სხვა
            სტუმრებს.
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
                    შეფასება
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
              ბოლოს ნანახი განცხადებები
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
              გააგრძელე სადაც გაჩერდი.
            </p>
          </div>
          <Link
            href="/apartments"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[#0F8F60] hover:underline"
          >
            ყველას ნახვა
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
                      {p.views_count} ნახვა
                    </p>
                    <div className="mt-auto flex items-baseline gap-1 pt-2">
                      <span className="text-[16px] font-black text-[#0F172A]">
                        {formatPrice(Number(p.price_per_night ?? 0))}
                      </span>
                      <span className="text-[11px] font-medium text-[#94A3B8]">
                        /ღამე
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </motion.section>

      {transportSvc.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-black text-[#0F172A]">
                ტრანსპორტი და გართობა
              </h2>
              <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                დაიჯავშნე შესანიშნავი შთაბეჭდილებებისთვის.
              </p>
            </div>
            <Link
              href="/services"
              className="inline-flex items-center gap-1 text-[13px] font-bold text-[#0F8F60] hover:underline"
            >
              ყველას ნახვა
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {transportSvc.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="group flex items-center gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                  {(s.photos ?? [])[0] && (
                    <Image
                      src={(s.photos ?? [])[0]}
                      alt={s.title}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
                    {s.title}
                  </h3>
                  {s.price != null && (
                    <p className="mt-1 text-[13px] font-black text-[#0F172A]">
                      {formatPrice(Number(s.price))}
                      {s.price_unit && (
                        <span className="text-[11px] font-medium text-[#94A3B8]">
                          {" "}
                          / {s.price_unit}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

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
