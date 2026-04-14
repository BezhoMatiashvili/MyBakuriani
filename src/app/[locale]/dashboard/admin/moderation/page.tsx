"use client";

import { EyeOff, Trash2 } from "lucide-react";

export default function ModerationPage() {
  const rows = [
    {
      id: "PR-8842",
      author: "ლევან დ.",
      text: '"საშინელი ბინაა, წყალი არ მოდიოდა და მესაკუთრე არ იღებდა ყურმილს. ეს არის თაღლითობა!"',
      sentiment: "NEGATIVE",
      risk: "LEGAL RISK",
      color: "border-[#EF4444]",
    },
    {
      id: "CR-1092",
      author: "გიორგი კ.",
      text: '"ძალიან სუფთა და თბილი ბინაა, Ski-in მდებარეობა საუკეთესოა! აუცილებლად დავბრუნდებით კიდევ."',
      sentiment: "POSITIVE",
      risk: "",
      color: "border-[#10B981]",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[56px] font-black leading-[1.05] tracking-[-1px] text-[#0F172A]">
          QR შეფასებების მოდერაცია
        </h1>
        <p className="mt-2 text-[30px] leading-tight text-[#64748B]">
          კომენტარების სემანტიკური აუდიტი (AI).
        </p>
      </div>

      <div className="space-y-5">
        {rows.map((row) => (
          <article
            key={row.id}
            className={`rounded-[24px] border-2 ${row.color} bg-white p-6`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[30px] font-black text-[#0F172A]">
                  სტუმარი: {row.author}
                </p>
                <p className="text-xl text-[#94A3B8]">ID {row.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-[#FEF2F2] px-3 py-1 text-xs font-extrabold tracking-[1.2px] text-[#B91C1C]">
                  {row.sentiment}
                </span>
                {row.risk && (
                  <span className="rounded-lg bg-[#FEF3C7] px-3 py-1 text-xs font-extrabold tracking-[1.2px] text-[#B45309]">
                    {row.risk}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-5">
              <blockquote className="flex-1 rounded-2xl bg-[#F8FAFC] p-5 text-[26px] font-medium leading-relaxed text-[#1E293B]">
                {row.text}
              </blockquote>
              <div className="flex w-[230px] flex-col gap-3">
                <button className="h-12 rounded-xl bg-[#059669] text-sm font-extrabold text-white">
                  დადასტურება
                </button>
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F1F5F9] text-sm font-bold text-[#475569]">
                  <EyeOff className="h-4 w-4" />
                  დამალვა
                </button>
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEF2F2] text-sm font-bold text-[#DC2626]">
                  <Trash2 className="h-4 w-4" />
                  წაშლა
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
