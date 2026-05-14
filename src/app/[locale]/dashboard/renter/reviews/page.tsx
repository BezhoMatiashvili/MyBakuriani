"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, CheckCircle2, Sparkles, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
  guest_id: string;
  property_id: string;
  profiles?: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  properties?: {
    title: string | null;
  } | null;
}

const MONTHS_KA = [
  "იან.",
  "თებ.",
  "მარ.",
  "აპრ.",
  "მაი.",
  "ივნ.",
  "ივლ.",
  "აგვ.",
  "სექ.",
  "ოქტ.",
  "ნოე.",
  "დეკ.",
];

function formatDateKa(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_KA[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RenterReviewsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function fetchReviews() {
      const { data: props } = await supabase
        .from("properties")
        .select("id")
        .eq("owner_id", user!.id);

      const propertyIds = (props ?? []).map((p) => p.id);
      if (propertyIds.length === 0) {
        if (active) {
          setReviews([]);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("reviews")
        .select(
          "id, rating, comment, created_at, guest_id, property_id, profiles:guest_id(display_name, avatar_url), properties:property_id(title)",
        )
        .in("property_id", propertyIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (active) {
        setReviews((data ?? []) as unknown as ReviewRow[]);
        setLoading(false);
      }
    }

    fetchReviews();
    return () => {
      active = false;
    };
  }, [user, supabase]);

  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          შეფასებები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          რეალური სტუმრების მიმოხილვები, რომლებიც დარჩენის შემდეგ შეფასების
          ბმულზე გადავიდნენ.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        {loading ? (
          <div className="space-y-3 px-6 py-6">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : totalReviews === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Bell className="h-10 w-10 text-[#CBD5E1]" />
            <p className="mt-3 text-sm text-[#94A3B8]">
              ჯერ არ გაქვთ შეფასებები
            </p>
            <p className="mt-1 text-xs text-[#CBD5E1]">
              როცა სტუმარი დატოვებს თქვენს ბინას, მას ავტომატურად მიეგზავნება
              შეფასების ბმული.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-5 px-6 py-6">
              <span className="text-[48px] font-black leading-none text-[#F97316]">
                {averageRating.toFixed(1)}
              </span>
              <div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4"
                      fill={i < Math.round(averageRating) ? "#F97316" : "none"}
                      stroke="#F97316"
                    />
                  ))}
                </div>
                <p className="mt-1 text-[13px] font-medium text-[#64748B]">
                  {totalReviews} დადასტურებული შეფასება
                </p>
              </div>
            </div>

            <div>
              {reviews.map((r, i) => (
                <article
                  key={r.id}
                  className={`px-6 py-6 ${
                    i === reviews.length - 1 ? "" : "border-t border-[#EEF1F4]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-extrabold text-[#0F172A]">
                          {r.profiles?.display_name ?? "სტუმარი"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#16A34A]">
                          <CheckCircle2 className="h-3 w-3" />
                          დადასტურებული
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            className="h-3.5 w-3.5"
                            fill={idx < r.rating ? "#F97316" : "none"}
                            stroke={idx < r.rating ? "#F97316" : "#E2E8F0"}
                          />
                        ))}
                      </div>
                      {r.properties?.title && (
                        <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
                          {r.properties.title}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                      {formatDateKa(r.created_at)}
                    </span>
                  </div>

                  {r.comment && (
                    <p className="mt-3 text-[13px] leading-[20px] text-[#475569]">
                      {r.comment}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      className="text-[12px] font-bold text-[#2563EB] hover:underline"
                    >
                      პასუხის გაცემა
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md bg-[#F3E8FF] px-2.5 py-1 text-[11px] font-bold text-[#9333EA] transition-colors hover:bg-[#E9D5FF]"
                    >
                      <Sparkles className="h-3 w-3" />
                      AI პასუხი
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </motion.section>
    </div>
  );
}
