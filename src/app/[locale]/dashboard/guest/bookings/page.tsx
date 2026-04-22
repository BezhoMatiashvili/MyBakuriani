"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Star,
  MapPin,
  Check,
  Megaphone,
  Sparkles,
  Calendar,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import NewBookingRequestModal, {
  type NewBookingRequestPayload,
} from "@/components/shared/NewBookingRequestModal";
import type { Tables } from "@/lib/types/database";

type Request = Tables<"smart_match_requests">;
type Property = Tables<"properties">;
type Owner = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "avatar_url" | "rating"
>;

interface OfferView {
  requestId: string;
  property: Property;
  owner: Owner | null;
  checkIn: string | null;
  checkOut: string | null;
  isNew: boolean;
}

type TabKey = "all" | "new";

export default function GuestBookingsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const { data: reqData } = await supabase
        .from("smart_match_requests")
        .select("*")
        .eq("guest_id", user!.id)
        .order("created_at", { ascending: false });

      if (!reqData || reqData.length === 0) {
        setLoading(false);
        return;
      }

      const requests = reqData as Request[];
      const propertyIds = Array.from(
        new Set(
          requests.flatMap((r) => (r.matched_properties ?? []) as string[]),
        ),
      );

      if (propertyIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: propData } = await supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds);

      const ownerIds = Array.from(
        new Set(
          (propData ?? [])
            .map((p) => p.owner_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const { data: ownerData } =
        ownerIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, display_name, avatar_url, rating")
              .in("id", ownerIds)
          : { data: [] as Owner[] };

      const propMap = new Map(
        ((propData as Property[]) ?? []).map((p) => [p.id, p]),
      );
      const ownerMap = new Map(
        ((ownerData as Owner[]) ?? []).map((o) => [o.id, o]),
      );

      const rows: OfferView[] = requests.flatMap((r) => {
        const matched = (r.matched_properties ?? []) as string[];
        return matched
          .map((pid) => propMap.get(pid))
          .filter((p): p is Property => Boolean(p))
          .map((p) => ({
            requestId: r.id,
            property: p,
            owner: p.owner_id ? (ownerMap.get(p.owner_id) ?? null) : null,
            checkIn: r.check_in,
            checkOut: r.check_out,
            isNew: r.status === "active",
          }));
      });

      setOffers(rows);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(
    () => (tab === "new" ? offers.filter((o) => o.isNew) : offers),
    [offers, tab],
  );
  const newCount = offers.filter((o) => o.isNew).length;

  async function submitNewRequest(p: NewBookingRequestPayload) {
    if (!user) return;
    await supabase.from("smart_match_requests").insert({
      guest_id: user.id,
      check_in: p.checkIn,
      check_out: p.checkOut,
      status: "active",
      preferences: { category: p.category } as unknown as never,
    });
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
            მიღებული შეთავაზებები
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            მფლობელების პერსონალური შეთავაზებები თქვენი მოთხოვნის მიხედვით.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#0F8F60] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52]"
        >
          <Plus className="h-4 w-4" />
          ახალი მოთხოვნა
        </button>
      </motion.div>

      <div className="flex items-center gap-2">
        {[
          { key: "all" as const, label: `ყველა (${offers.length})` },
          { key: "new" as const, label: `ახალი (${newCount})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
              tab === t.key
                ? "bg-[#0F8F60] text-white"
                : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0F8F60] hover:text-[#0F8F60]"
            }`}
          >
            {t.key === "new" && <Sparkles className="h-3.5 w-3.5" />}
            {t.label}
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
              ჯერ არ გაქვთ შეთავაზებები
            </p>
            <p className="mt-1 text-[12px] text-[#94A3B8]">
              გაგზავნეთ მოთხოვნა და მფლობელები დაგიკავშირდებიან.
            </p>
          </div>
        ) : (
          filtered.map((o, idx) => (
            <OfferCard
              key={`${o.requestId}-${o.property.id}-${idx}`}
              offer={o}
            />
          ))
        )}
      </motion.div>

      <NewBookingRequestModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={submitNewRequest}
      />
    </div>
  );
}

function OfferCard({ offer }: { offer: OfferView }) {
  const ownerName = offer.owner?.display_name ?? "მფლობელი";
  const initials = ownerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const photo = (offer.property.photos ?? [])[0] ?? null;
  const price = offer.property.price_per_night ?? 0;

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
            <span>სახლის მფლობელი</span>
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
            ახალი
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
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                ფასი
              </span>
              <p className="text-[18px] font-black text-[#0F172A]">
                {formatPrice(Number(price))}{" "}
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  /ღამე
                </span>
              </p>
            </div>
            <Link
              href={
                offer.property.is_for_sale
                  ? `/sales/${offer.property.id}`
                  : `/apartments/${offer.property.id}`
              }
              className="inline-flex items-center gap-1 rounded-xl bg-[#0F8F60] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#0B7A52]"
            >
              <Check className="h-3.5 w-3.5" />
              დამატება ჩემთან
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
