"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Clock, Heart, History, Phone, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

type BookingRow = Tables<"bookings"> & {
  properties: Pick<
    Tables<"properties">,
    "id" | "title" | "location" | "photos"
  > | null;
};

type ReviewRow = Tables<"reviews"> & {
  properties: Pick<Tables<"properties">, "title" | "photos"> | null;
};

const GE_MONTHS = [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი",
];

function formatReviewDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${GE_MONTHS[d.getMonth()]}`;
}

function formatCallRelative(iso: string | null) {
  if (!iso) return "დაუთარიღებელი";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "დაუთარიღებელი";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000,
  );

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  if (dayDiff <= 0) return `დარეკეთ დღეს, ${hh}:${mm}`;
  if (dayDiff === 1) return `დარეკეთ გუშინ, ${hh}:${mm}`;
  if (dayDiff < 7) return `დარეკეთ ${dayDiff} დღის წინ`;
  return `დარეკეთ ${formatReviewDate(iso)}`;
}

export default function GuestHistoryPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [bkRes, rvRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("*, properties(id, title, location, photos)")
          .eq("guest_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("reviews")
          .select("*, properties(title, photos)")
          .eq("guest_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (bkRes.data) setBookings(bkRes.data as BookingRow[]);
      if (rvRes.data) setReviews(rvRes.data as ReviewRow[]);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-8"
      >
        <h1 className="text-[30px] font-black leading-[38px] text-[#0F172A]">
          კომუნიკაციის ისტორია
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          ბოლო სერვისები და შეფასებები.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
            ბოლო ზარები
          </p>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-[16px]" />
              ))
            ) : bookings.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6 text-[#CBD5E1]" />}
                title="ზარები არ არის"
              />
            ) : (
              bookings.map((b) => <CallCard key={b.id} booking={b} />)
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
            ჩემი შეფასებები
          </p>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-[16px]" />
              ))
            ) : reviews.length === 0 ? (
              <EmptyState
                icon={<Star className="h-6 w-6 text-[#CBD5E1]" />}
                title="შეფასებები არ გაქვთ"
              />
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[#E2E8F0] bg-white py-10 text-center">
      {icon}
      <p className="mt-2 text-[12px] font-medium text-[#94A3B8]">{title}</p>
    </div>
  );
}

function CallCard({ booking }: { booking: BookingRow }) {
  const confirmed =
    booking.status === "confirmed" || booking.status === "completed";
  const iconChipColors = confirmed
    ? "bg-[#ECFDF5] text-[#0F8F60]"
    : "bg-[#FEF3C7] text-[#D97706]";
  const callChipColors = confirmed
    ? "bg-[#ECFDF5] text-[#0F8F60]"
    : "bg-[#FEF3C7] text-[#D97706]";

  return (
    <Link
      href={`/apartments/${booking.properties?.id ?? ""}`}
      className="flex items-center gap-3 rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-colors hover:border-[#0F8F60]/40"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconChipColors}`}
      >
        {confirmed ? (
          <Heart className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#0F172A]">
          {booking.properties?.title ?? "ობიექტი"}
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          {formatCallRelative(booking.created_at)}
        </p>
      </div>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${callChipColors}`}
      >
        <Phone className="h-4 w-4" />
      </span>
    </Link>
  );
}

function ReviewCard({ review }: { review: ReviewRow }) {
  const photo = review.properties?.photos?.[0] ?? null;
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {photo && (
          <Image
            src={photo}
            alt={review.properties?.title ?? ""}
            fill
            sizes="40px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#0F172A]">
          {review.properties?.title ?? "ობიექტი"}
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          {formatReviewDate(review.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < (review.rating ?? 0) ? "text-[#F59E0B]" : "text-[#E2E8F0]"
            }`}
            fill="currentColor"
          />
        ))}
      </div>
    </div>
  );
}
