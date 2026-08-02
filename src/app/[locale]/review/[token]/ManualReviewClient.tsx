"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { useTranslations } from "next-intl";

type Details = { property_title: string; guest_name: string | null };

export function ManualReviewClient({ token }: { token: string }) {
  const t = useTranslations("ManualReview");
  const [details, setDetails] = useState<Details | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void fetch(`/api/reviews/manual/${token}`, { cache: "no-store" })
      .then(async (response) => response.ok ? ((await response.json()).review as Details) : null)
      .then(setDetails)
      .catch(() => setDetails(null));
  }, [token]);

  const submit = async () => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    const response = await fetch(`/api/reviews/manual/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    setSubmitting(false);
    if (response.ok) setSubmitted(true);
    else setDetails(null);
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-lg sm:p-8">
        {details === undefined ? <p className="text-center text-[#64748B]">{t("loading")}</p> : details === null ? <p className="text-center font-bold text-[#991B1B]">{t("invalid")}</p> : submitted ? (
          <div className="text-center"><CheckCircle2 className="mx-auto size-12 text-[#16A34A]" /><h1 className="mt-4 text-2xl font-black text-[#0F172A]">{t("thanks")}</h1></div>
        ) : (
          <>
            <h1 className="text-2xl font-black text-[#0F172A]">{t("title")}</h1>
            <p className="mt-2 text-sm text-[#64748B]">{t("subtitle", { property: details.property_title })}</p>
            <div className="mt-6 flex gap-2" role="radiogroup" aria-label={t("ratingLabel")}>
              {[1,2,3,4,5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} onClick={() => setRating(value)} className="rounded-lg p-1"><Star className={`size-8 ${value <= rating ? "fill-[#FACC15] text-[#FACC15]" : "text-[#CBD5E1]"}`} /></button>)}
            </div>
            <label className="mt-6 block text-sm font-bold text-[#334155]">{t("commentLabel")}<textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-[#E2E8F0] p-3 font-normal outline-none focus:border-[#2563EB]" /></label>
            <button type="button" disabled={rating < 1 || submitting} onClick={() => void submit()} className="mt-6 h-12 w-full rounded-xl bg-[#2563EB] font-bold text-white disabled:opacity-50">{submitting ? t("submitting") : t("submit")}</button>
          </>
        )}
      </section>
    </main>
  );
}
