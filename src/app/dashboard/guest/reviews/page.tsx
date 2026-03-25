"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useBookings } from "@/lib/hooks/useBookings";
import { formatDate } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/lib/types/database";

type Review = Database["public"]["Tables"]["reviews"]["Row"];

export default function GuestReviewsPage() {
  const supabase = createClient();
  const { bookings, list: listBookings } = useBookings();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<string | null>(null); // booking id
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listBookings();
  }, [listBookings]);

  useEffect(() => {
    async function fetchReviews() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("reviews")
        .select("*")
        .eq("guest_id", user.id)
        .order("created_at", { ascending: false });

      setReviews(data ?? []);
      setLoading(false);
    }

    fetchReviews();
  }, []);

  // Completed bookings without reviews
  const reviewedBookingIds = new Set(
    reviews.map((r) => r.booking_id).filter(Boolean),
  );
  const completedUnreviewed = bookings.filter(
    (b) => b.status === "completed" && !reviewedBookingIds.has(b.id),
  );

  async function handleSubmit(bookingId: string, propertyId: string) {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("reviews")
        .insert({
          property_id: propertyId,
          booking_id: bookingId,
          guest_id: user.id,
          rating,
          comment: comment.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setReviews((prev) => [data, ...prev]);
      }
      setShowForm(null);
      setRating(5);
      setComment("");
    } catch {
      // error silenced
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">ჩემი შეფასებები</h1>

      {/* Pending reviews */}
      {completedUnreviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            შეაფასეთ დასრულებული ჯავშნები
          </h2>
          <div className="space-y-3">
            {completedUnreviewed.map((booking) => (
              <div
                key={booking.id}
                className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      ჯავშანი #{booking.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.check_out)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={showForm === booking.id ? "secondary" : "default"}
                    onClick={() =>
                      setShowForm(showForm === booking.id ? null : booking.id)
                    }
                  >
                    {showForm === booking.id ? "დახურვა" : "შეფასება"}
                  </Button>
                </div>

                <AnimatePresence>
                  {showForm === booking.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        {/* Star rating */}
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            რეიტინგი
                          </p>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setRating(star)}
                                className="transition-transform hover:scale-110"
                              >
                                <Star
                                  className={`size-7 ${
                                    star <= rating
                                      ? "fill-brand-warning text-brand-warning"
                                      : "text-gray-300"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Comment */}
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            კომენტარი
                          </p>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="დაწერეთ კომენტარი..."
                            rows={3}
                            className="w-full resize-none rounded-lg border border-brand-surface-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                          />
                        </div>

                        <Button
                          size="sm"
                          disabled={submitting}
                          onClick={() =>
                            handleSubmit(booking.id, booking.property_id)
                          }
                          className="gap-1.5"
                        >
                          <Send className="size-3.5" />
                          {submitting ? "იგზავნება..." : "გაგზავნა"}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Existing reviews */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          ჩემი შეფასებები ({reviews.length})
        </h2>
        {reviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ჯერ არ გაქვთ შეფასებები
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review, i) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`size-4 ${
                          star <= review.rating
                            ? "fill-brand-warning text-brand-warning"
                            : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.created_at)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-foreground">
                    {review.comment}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
