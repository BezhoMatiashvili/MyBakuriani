"use client";

import { Check, EyeOff, ShieldAlert, Star, Trash2 } from "lucide-react";

interface ModerationRow {
  id: string;
  author: string;
  rating: number;
  tone: "NEGATIVE" | "POSITIVE";
  risk?: string;
  text: string;
}

const rows: ModerationRow[] = [
  {
    id: "PR-8842",
    author: "ლევან დ.",
    rating: 1,
    tone: "NEGATIVE",
    risk: "LEGAL RISK",
    text: '"საშინელი ბინაა, წყალი არ მოდიოდა და მესაკუთრე არ იღებდა ყურმილს. ეს არის თაღლითობა!"',
  },
  {
    id: "CR-1092",
    author: "გიორგი კ.",
    rating: 5,
    tone: "POSITIVE",
    text: '"ძალიან სუფთა და თბილი ბინაა, Ski-in ნამდვილად მუშაობს! აუცილებლად დავბრუნდებით კიდევ."',
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-[2px] text-[#D8B248]">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className="h-3.5 w-3.5"
          fill={index < rating ? "#D8B248" : "transparent"}
          strokeWidth={1.9}
        />
      ))}
    </span>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="flex w-full max-w-[918px] flex-col gap-6 pb-10">
      <div className="pb-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          QR შეფასებების მოდერაცია
        </h1>
        <p className="mt-2 text-[14px] font-medium leading-[21px] text-[#64748B]">
          კომენტარების სემანტიკური აუდიტი (AI).
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {rows.map((row) => {
          const isNegative = row.tone === "NEGATIVE";

          return (
            <article
              key={row.id}
              className={`flex gap-6 rounded-[20px] border bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] ${
                isNegative
                  ? "border-[#FEE2E2] border-l-[3px] border-l-[#DC2626]"
                  : "border-[#E2E8E5] border-l-[3px] border-l-[#059669]"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-4 pb-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-[15px] font-bold leading-[22px] text-[#1E293B]">
                    სტუმარი: {row.author}
                  </p>
                  <div className="flex items-center gap-1">
                    <Stars rating={row.rating} />
                    <span className="ml-1 text-[13px] font-medium text-[#94A3B8]">
                      ({row.rating})
                    </span>
                  </div>
                  <p className="pl-1 text-[11px] font-bold text-[#94A3B8]">
                    ID {row.id}
                  </p>

                  <div className="ml-auto flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[9px] font-black tracking-[0.45px] ${
                        isNegative
                          ? "border-[#FEE2E2] bg-[#EFF6FF] text-[#DC2626]"
                          : "border-[#E2E8E5] bg-[#ECFDF5] text-[#059669]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isNegative ? "bg-[#DC2626]" : "bg-[#059669]"
                        }`}
                      />
                      {row.tone}
                    </span>
                    {row.risk ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#FFEDD5] bg-[#ECFDF5] px-2.5 py-1 text-[9px] font-black tracking-[0.45px] text-[#F97316]">
                        <ShieldAlert className="h-2.5 w-2.5" />
                        {row.risk}
                      </span>
                    ) : null}
                  </div>
                </div>

                <blockquote
                  className={`rounded-[14px] border px-4 pb-4 pt-[14px] text-sm font-medium leading-[23px] text-[#334155] ${
                    isNegative
                      ? "border-[#FEE2E2] bg-[rgba(239,246,255,0.5)]"
                      : "border-[#ECFDF5] bg-[#F8FAFC]"
                  }`}
                >
                  {row.text}
                </blockquote>
              </div>

              <div className="flex w-[150px] shrink-0 flex-col gap-2.5">
                <button
                  type="button"
                  className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-[#059669] text-[12px] font-bold text-white shadow-[0px_1px_2px_rgba(16,185,129,0.2)]"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  დადასტურება
                </button>
                <button
                  type="button"
                  className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-[#F1F5F9] text-[12px] font-bold text-[#334155]"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  დამალვა
                </button>
                <button
                  type="button"
                  className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-[#FEF2F2] text-[12px] font-bold text-[#DC2626]"
                >
                  <Trash2 className="h-3 w-3" />
                  წაშლა
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
