"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, Sparkles, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
  status: string;
  ai_sentiment: string | null;
  ai_risk_tags: string[] | null;
  ai_analyzed_at: string | null;
  moderation_notes: string | null;
  guest: { display_name: string; phone: string } | null;
  property: { title: string } | null;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "ყველა" },
  { value: "pending", label: "მოლოდინში" },
  { value: "approved", label: "დადასტურებული" },
  { value: "hidden", label: "დამალული" },
  { value: "removed", label: "წაშლილი" },
];

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-[#FEF3C7] text-[#B45309]",
  approved: "bg-[#DCFCE7] text-[#15803D]",
  hidden: "bg-[#F1F5F9] text-[#64748B]",
  removed: "bg-[#FEE2E2] text-[#B91C1C]",
};

const SENTIMENT_TONES: Record<string, string> = {
  positive: "border-[#10B981] bg-[#ECFDF5] text-[#059669]",
  negative: "border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C]",
  neutral: "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
};

export default function ReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminReview[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/admin/reviews${q}`, { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "ჩატვირთვა ვერ მოხერხდა");
      setRows([]);
    } else {
      setRows(payload.reviews as AdminReview[]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(id: string, action: "approve" | "hide" | "remove") {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/reviews/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "შეცდომა");
      toast.success("სტატუსი განახლდა");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusyId(null);
    }
  }

  async function analyze(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/reviews/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "AI ანალიზი ვერ მოხერხდა");
      toast.success("AI ანალიზი დასრულდა");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending").length,
    [rows],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
            QR შეფასებების მოდერაცია
          </h1>
          <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
            კომენტარების სემანტიკური აუდიტი (AI) •{" "}
            {pendingCount > 0
              ? `${pendingCount} მოლოდინში`
              : "ახალი შეფასება არ არის"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`inline-flex h-10 items-center rounded-lg border px-4 text-[13px] font-bold transition-colors ${
                  active
                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                    : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="space-y-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-44 w-full rounded-[24px]" />
          ))
        ) : rows.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#E2E8F0] bg-white py-16 text-center">
            <p className="text-sm font-medium text-[#94A3B8]">
              ამ ფილტრით შეფასებები ვერ მოიძებნა
            </p>
          </div>
        ) : (
          rows.map((review) => {
            const sentimentTone =
              review.ai_sentiment && SENTIMENT_TONES[review.ai_sentiment]
                ? SENTIMENT_TONES[review.ai_sentiment]
                : SENTIMENT_TONES.neutral;
            const riskTags = Array.isArray(review.ai_risk_tags)
              ? review.ai_risk_tags
              : [];
            const isBusy = busyId === review.id;
            return (
              <article
                key={review.id}
                className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[20px] font-black leading-7 text-[#0F172A]">
                      {review.guest?.display_name ?? "უცნობი სტუმარი"}
                    </p>
                    <p className="text-[13px] font-medium text-[#94A3B8]">
                      ობიექტი: {review.property?.title ?? "—"}
                    </p>
                    <p className="text-[13px] font-semibold text-[#1E293B]">
                      {review.rating}/5 ★
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-lg px-3 py-1 text-xs font-extrabold uppercase tracking-[1.2px] ${
                        STATUS_BADGES[review.status] ?? STATUS_BADGES.pending
                      }`}
                    >
                      {review.status}
                    </span>
                    {review.ai_sentiment ? (
                      <span
                        className={`rounded-lg border px-3 py-1 text-xs font-extrabold uppercase tracking-[1.2px] ${sentimentTone}`}
                      >
                        {review.ai_sentiment}
                      </span>
                    ) : null}
                    {riskTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg bg-[#FEF3C7] px-3 py-1 text-xs font-extrabold uppercase tracking-[1.2px] text-[#B45309]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row">
                  <blockquote className="flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-[14px] font-medium leading-[22px] text-[#1E293B]">
                    {review.comment?.trim() ? (
                      review.comment
                    ) : (
                      <span className="text-[#94A3B8]">
                        (კომენტარის გარეშე)
                      </span>
                    )}
                  </blockquote>
                  <div className="flex w-full flex-col gap-3 lg:w-[230px]">
                    <button
                      type="button"
                      onClick={() => analyze(review.id)}
                      disabled={isBusy || !review.comment?.trim()}
                      className="inline-flex h-[48px] min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#DDD6FE] bg-[#FAF5FF] text-sm font-bold text-[#7C3AED] disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      AI აუდიტი
                    </button>
                    <button
                      type="button"
                      onClick={() => moderate(review.id, "approve")}
                      disabled={isBusy}
                      className="inline-flex h-[48px] min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#059669] text-sm font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1)] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      დადასტურება
                    </button>
                    <button
                      type="button"
                      onClick={() => moderate(review.id, "hide")}
                      disabled={isBusy}
                      className="inline-flex h-[48px] min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-bold text-[#475569] disabled:opacity-50"
                    >
                      <EyeOff className="h-4 w-4" />
                      დამალვა
                    </button>
                    <button
                      type="button"
                      onClick={() => moderate(review.id, "remove")}
                      disabled={isBusy}
                      className="inline-flex h-[48px] min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-sm font-bold text-[#DC2626] disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      წაშლა
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
