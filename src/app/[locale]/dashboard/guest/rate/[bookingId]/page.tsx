"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import { Star, CheckCircle2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

interface BookingRow {
  id: string;
  property_id: string;
  guest_id: string;
  check_in: string;
  check_out: string;
  status: string;
}

interface PropertyRow {
  id: string;
  title: string;
  photos: string[] | null;
  location: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "not-yours" }
  | { kind: "not-finished" }
  | { kind: "already-rated" }
  | { kind: "ready"; booking: BookingRow; property: PropertyRow };

export default function GuestRatePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const params = useParams<{ bookingId: string; locale: string }>();
  const bookingId = params.bookingId;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !bookingId) return;
    let active = true;

    async function load() {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, property_id, guest_id, check_in, check_out, status")
        .eq("id", bookingId)
        .maybeSingle();

      if (!active) return;

      if (!booking) {
        setState({ kind: "not-found" });
        return;
      }
      if (booking.guest_id !== user!.id) {
        setState({ kind: "not-yours" });
        return;
      }
      if (booking.status !== "completed") {
        setState({ kind: "not-finished" });
        return;
      }

      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (existing) {
        if (active) setState({ kind: "already-rated" });
        return;
      }

      const { data: property } = await supabase
        .from("properties")
        .select("id, title, photos, location")
        .eq("id", booking.property_id)
        .maybeSingle();

      if (!property) {
        setState({ kind: "not-found" });
        return;
      }

      if (active) {
        setState({
          kind: "ready",
          booking: booking as BookingRow,
          property: property as PropertyRow,
        });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user, bookingId, supabase]);

  const displayRating = hover || rating;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready" || !user) return;
    if (rating < 1 || rating > 5) {
      setSubmitError("გთხოვთ აირჩიოთ შეფასება 1-დან 5-მდე");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.from("reviews").insert({
      booking_id: state.booking.id,
      property_id: state.property.id,
      guest_id: user.id,
      rating,
      comment: comment.trim() || null,
      status: "pending",
    });

    if (error) {
      setSubmitting(false);
      setSubmitError("შეფასების შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.");
      return;
    }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("action_url", `/dashboard/guest/rate/${state.booking.id}`);

    router.push("/dashboard/guest/reviews?rated=1");
  }

  const cover = useMemo(() => {
    if (state.kind !== "ready") return null;
    return (state.property.photos ?? [])[0] ?? null;
  }, [state]);

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6">
      <motion.button
        type="button"
        onClick={() => router.back()}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="inline-flex items-center gap-2 text-[13px] font-bold text-[#64748B] hover:text-[#0F172A]"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[32px] font-black leading-[40px] text-[#0F172A]">
          შეაფასეთ თქვენი დარჩენა
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          თქვენი მიმოხილვა დაეხმარება სხვა სტუმრებს უკეთესი არჩევანის
          გაკეთებაში.
        </p>
      </motion.div>

      {state.kind === "loading" && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {state.kind === "not-found" && (
        <EmptyState
          title="ჯავშანი ვერ მოიძებნა"
          subtitle="შესაძლოა ბმული მცდარია ან ჯავშანი წაშლილია."
        />
      )}

      {state.kind === "not-yours" && (
        <EmptyState
          title="წვდომა შეზღუდულია"
          subtitle="ამ ჯავშნის შეფასება მხოლოდ მის სტუმარს შეუძლია."
        />
      )}

      {state.kind === "not-finished" && (
        <EmptyState
          title="დარჩენა ჯერ არ დასრულებულა"
          subtitle="შეფასების ბმული გააქტიურდება გასვლის თარიღის შემდეგ."
        />
      )}

      {state.kind === "already-rated" && (
        <EmptyState
          title="ამ ჯავშანი უკვე შეფასებულია"
          subtitle="გმადლობთ მიმოხილვისთვის! შეგიძლიათ ნახოთ თქვენი შეფასებები პროფილში."
          icon="check"
        />
      )}

      {state.kind === "ready" && (
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6 rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
        >
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
              {cover && (
                <Image
                  src={cover}
                  alt={state.property.title}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-extrabold text-[#0F172A]">
                {state.property.title}
              </h2>
              {state.property.location && (
                <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                  {state.property.location}
                </p>
              )}
              <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
                {state.booking.check_in} – {state.booking.check_out}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-bold text-[#0F172A]">
              თქვენი შეფასება
            </p>
            <div
              className="flex items-center gap-1.5"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  className="p-0.5 transition-transform hover:scale-110"
                  aria-label={`${n} ვარსკვლავი`}
                >
                  <Star
                    className="h-8 w-8"
                    fill={n <= displayRating ? "#F97316" : "none"}
                    stroke={n <= displayRating ? "#F97316" : "#CBD5E1"}
                    strokeWidth={2}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-[13px] font-bold text-[#F97316]">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="comment"
              className="mb-2 block text-[13px] font-bold text-[#0F172A]"
            >
              კომენტარი (არასავალდებულო)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="რა მოგეწონათ და რა შეიძლება გაუმჯობესდეს?"
              className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-[14px] text-[#0F172A] outline-none transition-colors focus:border-[#2563EB]"
            />
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              {comment.length}/2000
            </p>
          </div>

          {submitError && (
            <p className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#DC2626]">
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={submitting}
              className="rounded-xl px-5 py-2.5 text-[13px] font-bold text-[#64748B] hover:bg-[#F8FAFC]"
            >
              გაუქმება
            </button>
            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F8F60] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "იგზავნება..." : "შეფასების გაგზავნა"}
            </button>
          </div>
        </motion.form>
      )}
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  icon = "info",
}: {
  title: string;
  subtitle: string;
  icon?: "info" | "check";
}) {
  const Icon = icon === "check" ? CheckCircle2 : Star;
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-[#EEF1F4] bg-white px-6 py-16 text-center shadow-[0px_1px_3px_rgba(0,0,0,0.04)]">
      <Icon className="h-10 w-10 text-[#CBD5E1]" />
      <p className="mt-2 text-[16px] font-extrabold text-[#0F172A]">{title}</p>
      <p className="text-[13px] font-medium text-[#94A3B8]">{subtitle}</p>
    </div>
  );
}
