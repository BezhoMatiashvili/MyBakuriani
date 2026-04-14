"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import type { Tables } from "@/lib/types/database";

type ReviewWithProperty = Tables<"reviews"> & {
  properties: Pick<
    Tables<"properties">,
    "title" | "location" | "photos"
  > | null;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </div>
  );
}

export default function GuestReviewsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [reviews, setReviews] = useState<ReviewWithProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchReviews() {
      const { data } = await supabase
        .from("reviews")
        .select("*, properties(title, location, photos)")
        .eq("guest_id", user!.id)
        .order("created_at", { ascending: false });

      if (data) setReviews(data as ReviewWithProperty[]);
      setLoading(false);
    }

    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          ჩემი შეფასებები
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          თქვენი დატოვებული შეფასებები და რეიტინგი
        </p>
      </motion.div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-6 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="text-center">
          <p className="text-3xl font-bold text-[#1E293B]">{averageRating}</p>
          <StarRating rating={Math.round(Number(averageRating))} />
        </div>
        <div className="h-12 w-px bg-border" />
        <div>
          <p className="text-2xl font-bold text-[#1E293B]">{reviews.length}</p>
          <p className="text-xs text-[#94A3B8]">სულ შეფასებები</p>
        </div>
      </motion.div>

      {/* Reviews list */}
      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1 h-3 w-3/4" />
            </div>
          ))
        ) : reviews.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <MessageSquare className="h-12 w-12 text-[#94A3B8]" />
            <p className="mt-3 text-sm text-[#94A3B8]">
              შეფასებები ჯერ არ გაქვთ
            </p>
          </motion.div>
        ) : (
          reviews.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#F8FAFC]">
                    {review.properties?.photos?.[0] && (
                      <Image
                        src={review.properties.photos[0]}
                        alt={review.properties?.title ?? ""}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1E293B]">
                      {review.properties?.title ?? "ობიექტი"}
                    </h3>
                    <p className="text-xs text-[#94A3B8]">
                      {review.properties?.location}
                    </p>
                  </div>
                </div>
                <StarRating rating={review.rating} />
              </div>

              {review.comment && (
                <p className="mt-3 text-sm text-[#94A3B8]">{review.comment}</p>
              )}

              <p className="mt-2 text-[10px] text-[#94A3B8]">
                {new Date(review.created_at ?? "").toLocaleDateString("ka-GE")}
              </p>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
