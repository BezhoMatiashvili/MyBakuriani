"use client";

import { motion } from "framer-motion";
import { QrCode, Star, CheckCircle2, Sparkles } from "lucide-react";

interface Review {
  id: string;
  author: string;
  verified: boolean;
  rating: number;
  text: string;
  date: string;
  ownerReply?: string;
}

// TODO: wire to real reviews table — mock data matches Figma reference.
const MOCK_REVIEWS: Review[] = [
  {
    id: "1",
    author: "გიორგი კ.",
    verified: true,
    rating: 5,
    text: "იდეალური სისუფთავე და ძალიან თბილი ბინა. ნამდვილად გირჩევთ ყველას! Ski-in ნამდვილად მუშაობს.",
    date: "12 თებ. 2026",
  },
  {
    id: "2",
    author: "ნინო მახარაძე",
    verified: true,
    rating: 5,
    text: "ბინა ზუსტად ისეთივეა, როგორც ფოტოებზე. ძალიან კარგად მოწყობილი სამზარეულო და კომფორტული საწოლები. მესაკუთრე ყურადღებიანია.",
    date: "08 თებ. 2026",
  },
  {
    id: "3",
    author: "დავით გ.",
    verified: true,
    rating: 4,
    text: "კარგი ლოკაციაა, მაგრამ ინტერნეტი ოდნავ ჭედავდა საღამოობით. სხვა მხრივ ყველაფერი წესრიგში იყო.",
    date: "01 თებ. 2026",
    ownerReply:
      "მადლობა შეფასებისთვის დავით. ინტერნეტის პრობლემა უკვე მოგვარებულია ახალი როუტერის დამონტაჟებით. გიცდეთ კიდევ!",
  },
];

export default function RenterQrReviewsPage() {
  const averageRating = 4.9;
  const totalReviews = 24;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            QR შეფასებები
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            რეალური სტუმრების მიმოხილვები.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          <QrCode className="h-4 w-4" strokeWidth={2.2} />
          QR-ის ჩამოტვირთვა
        </button>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        {/* Rating summary */}
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
                  fill="#F97316"
                  stroke="#F97316"
                />
              ))}
            </div>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              {totalReviews} დადასტურებული შეფასება
            </p>
          </div>
        </div>

        {/* Reviews */}
        <div>
          {MOCK_REVIEWS.map((r, i) => (
            <article
              key={r.id}
              className={`px-6 py-6 ${
                i === MOCK_REVIEWS.length - 1 ? "" : "border-t border-[#EEF1F4]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-extrabold text-[#0F172A]">
                      {r.author}
                    </span>
                    {r.verified && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#16A34A]">
                        <CheckCircle2 className="h-3 w-3" />
                        დადასტურებული
                      </span>
                    )}
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
                </div>
                <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                  {r.date}
                </span>
              </div>

              <p className="mt-3 text-[13px] leading-[20px] text-[#475569]">
                {r.text}
              </p>

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

              {r.ownerReply && (
                <div className="mt-4 rounded-xl bg-[#F8FAFC] px-4 py-3">
                  <p className="text-[12px] font-bold text-[#2563EB]">
                    თქვენი პასუხი:
                  </p>
                  <p className="mt-1 text-[13px] leading-[20px] text-[#475569]">
                    {r.ownerReply}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
