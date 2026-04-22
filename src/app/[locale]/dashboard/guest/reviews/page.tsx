"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Star, Phone, MapPin, History } from "lucide-react";
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

export default function GuestReviewsPage() {
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
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          ისტორია და შეფასებები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          წარსული ჯავშნები და თქვენი შეფასებები.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            ჩემი ჯავშნები
          </h2>

          <div className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))
            ) : bookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <History className="h-8 w-8 text-[#CBD5E1]" />
                <p className="mt-2 text-[12px] text-[#94A3B8]">
                  ჯავშნები არ არის
                </p>
              </div>
            ) : (
              bookings.map((b) => (
                <Link
                  key={b.id}
                  href={`/apartments/${b.properties?.id ?? ""}`}
                  className="flex items-center gap-3 rounded-xl border border-[#EEF1F4] bg-white p-3 transition-colors hover:border-[#0F8F60]/40"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                    {b.properties?.photos?.[0] && (
                      <Image
                        src={b.properties.photos[0]}
                        alt={b.properties.title}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#0F172A]">
                      {b.properties?.title ?? "ობიექტი"}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                      <MapPin className="h-3 w-3" />
                      {b.properties?.location ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full p-2 ${
                      b.status === "confirmed" || b.status === "completed"
                        ? "bg-[#DCFCE7] text-[#16A34A]"
                        : "bg-[#FEF3C7] text-[#D97706]"
                    }`}
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            ჩემი შეფასებები
          </h2>

          <div className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))
            ) : reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Star className="h-8 w-8 text-[#CBD5E1]" />
                <p className="mt-2 text-[12px] text-[#94A3B8]">
                  შეფასებები არ გაქვთ
                </p>
              </div>
            ) : (
              reviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-[#EEF1F4] bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="truncate text-[13px] font-bold text-[#0F172A]">
                      {r.properties?.title ?? "ობიექტი"}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${
                            i < (r.rating ?? 0)
                              ? "text-[#F59E0B]"
                              : "text-[#E2E8F0]"
                          }`}
                          fill="currentColor"
                        />
                      ))}
                    </div>
                  </div>
                  {r.comment && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[#64748B]">
                      {r.comment}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
