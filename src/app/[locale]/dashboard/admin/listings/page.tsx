"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pause, Play, Trash2 } from "lucide-react";

type ListingRow = {
  id: string;
  title: string;
  owner: string;
  metricA: string;
  metricALabel: string;
  metricB: string;
  metricBLabel: string;
  metricC?: string;
  metricCLabel?: string;
  quality: string;
  qualityMeta: string;
  qualityTone: "green" | "orange";
  category: "ბინები" | "ტრანსპორტი" | "სერვისები / ხელოსნები";
  status: "აქტიური" | "გაჩერებული";
};

const CATEGORIES = [
  "ყველა კატეგორია",
  "ბინები",
  "ტრანსპორტი",
  "სერვისები / ხელოსნები",
] as const;

const ROWS: ListingRow[] = [
  {
    id: "PR-8842",
    title: "VIP აპარტამენტი კრისტალში",
    owner: "გიორგი მ.",
    metricA: "1.2K",
    metricALabel: "ნახვა",
    metricB: "45",
    metricBLabel: "Lead",
    metricC: "3.7%",
    metricCLabel: "Conv",
    quality: "Score: 95/100",
    qualityMeta: "ფოტო: 8/8 | კალენდ. დღეს",
    qualityTone: "green",
    category: "ბინები",
    status: "აქტიური",
  },
  {
    id: "TR-112",
    title: "მინივენი (8 ადგილი)",
    owner: "დავით გ.",
    metricA: "800",
    metricALabel: "ნახვა",
    metricB: "12",
    metricBLabel: "ზარი",
    quality: "ტრანსპორტი",
    qualityMeta: "",
    qualityTone: "green",
    category: "ტრანსპორტი",
    status: "აქტიური",
  },
  {
    id: "CT-301",
    title: "კოტეჯი ტყის პირას",
    owner: "ანა მ.",
    metricA: "3.4K",
    metricALabel: "ნახვა",
    metricB: "120",
    metricBLabel: "Lead",
    metricC: "4.2%",
    metricCLabel: "Conv",
    quality: "Score: 85/100",
    qualityMeta: "ფოტო: 5/8 | კალენდ. 1 თვე",
    qualityTone: "orange",
    category: "ბინები",
    status: "გაჩერებული",
  },
  {
    id: "SR-005",
    title: "პროფესიონალი დამლაგებელი",
    owner: "ნინო",
    metricA: "500",
    metricALabel: "ნახვა",
    metricB: "34",
    metricBLabel: "ზარი",
    quality: "სერვისი",
    qualityMeta: "",
    qualityTone: "green",
    category: "სერვისები / ხელოსნები",
    status: "აქტიური",
  },
];

export default function ListingsPage() {
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]>("ყველა კატეგორია");
  const [menuOpen, setMenuOpen] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  const filteredRows =
    selectedCategory === "ყველა კატეგორია"
      ? ROWS
      : ROWS.filter((row) => row.category === selectedCategory);

  return (
    <div className="bg-[#F8FAFC]">
      <div className="h-full w-full px-0 py-0">
        <div className="mb-6 flex w-full items-start justify-between gap-6 pb-2">
          <div>
            <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
              განცხადებების მართვა
            </h1>
            <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
              ხარისხის კონტროლი და ოპერაციული მეტრიკები.
            </p>
          </div>

          <div ref={dropdownRef} className="relative w-[220px] shrink-0 pt-2">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="relative flex h-[41px] w-full items-center justify-between rounded-xl border border-[#2563EB] bg-white px-4"
            >
              <span className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_0_0_4px_rgba(37,99,235,0.1)]" />
              <span className="text-[13px] font-bold text-[#334155]">
                {selectedCategory}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-[#2563EB] transition-transform ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[46px] z-20 h-[189px] w-[220px] rounded-xl border border-[#ECFDF5] bg-white py-1.5 shadow-[0_15px_35px_rgba(0,0,0,0.08)]">
                {CATEGORIES.map((category) => {
                  const selected = category === selectedCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(category);
                        setMenuOpen(false);
                      }}
                      className={`flex h-[44px] w-full items-center justify-between border-t border-[#F8FAFC] px-[16px] text-left first:h-[43px] first:border-t-0 ${
                        selected ? "bg-[#EFF6FF80]" : "bg-white"
                      }`}
                    >
                      <span
                        className={`text-[13px] ${
                          selected
                            ? "font-bold text-[#2563EB]"
                            : "font-medium text-[#475569]"
                        }`}
                      >
                        {category}
                      </span>
                      <Check
                        className={`h-[13px] w-[13px] text-[#2563EB] ${
                          selected ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="h-[480px] w-full overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "26.7%" }} />
              <col style={{ width: "19.8%" }} />
              <col style={{ width: "22.4%" }} />
              <col style={{ width: "15.9%" }} />
              <col style={{ width: "15.2%" }} />
            </colgroup>
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFCCC]">
              <tr className="text-left">
                <th className="px-6 py-7 text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">
                  ობიექტი
                </th>
                <th className="px-6 py-5 text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">
                  მეტრიკები (Funnel)
                </th>
                <th className="px-6 py-7 text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">
                  ხარისხი (Health)
                </th>
                <th className="px-6 py-7 text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">
                  სტატუსი
                </th>
                <th className="px-6 py-7 text-right text-xs font-bold uppercase tracking-[1.2px] text-[#64748B]">
                  ოპერაციები
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredRows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-l-4 border-l-[#F1F5F9] ${
                    index === 0
                      ? "h-[106px]"
                      : index === 1
                        ? "h-[88px]"
                        : index === 2
                          ? "h-[107px]"
                          : "h-[106px]"
                  }`}
                >
                  <td className="px-6 py-[16px] align-middle">
                    <p className="text-sm font-black leading-[19px] text-[#1E293B]">
                      {row.title}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-[#94A3B8]">
                      ID: {row.id} | {row.owner}
                    </p>
                  </td>

                  <td className="px-6 py-[16px] align-middle">
                    <div className="space-y-1.5 text-[11px]">
                      <p className="flex items-center justify-between gap-8">
                        <span className="font-bold text-[#64748B]">
                          {row.metricALabel}:
                        </span>
                        <span className="font-black text-[#1E293B]">
                          {row.metricA}
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-8">
                        <span className="font-bold text-[#64748B]">
                          {row.metricBLabel}:
                        </span>
                        <span className="font-black text-[#1E293B]">
                          {row.metricB}
                        </span>
                      </p>
                      {row.metricC && row.metricCLabel ? (
                        <p className="flex items-center justify-between gap-8">
                          <span className="font-bold text-[#64748B]">
                            {row.metricCLabel}:
                          </span>
                          <span className="font-black text-[#10B981]">
                            {row.metricC}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-6 py-[16px] align-middle">
                    {row.category === "ბინები" ? (
                      <>
                        <p
                          className={`text-xs font-black ${
                            row.qualityTone === "green"
                              ? "text-[#10B981]"
                              : "text-[#F97316]"
                          }`}
                        >
                          {row.quality}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-[#94A3B8]">
                          {row.qualityMeta}
                        </p>
                      </>
                    ) : (
                      <span
                        className={`inline-flex rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.5px] ${
                          row.category === "ტრანსპორტი"
                            ? "border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]"
                            : "border-[#EEF1F4] bg-[#F8FAFC] text-[#9333EA]"
                        }`}
                      >
                        {row.category}
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-[16px] align-middle">
                    <span
                      className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.5px] ${
                        row.status === "აქტიური"
                          ? "border-[#E2E8E5] bg-[#ECFDF5] text-[#10B981]"
                          : "border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>

                  <td className="px-6 py-[16px] align-middle">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]"
                      >
                        {row.status === "აქტიური" ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-7 flex items-center justify-center gap-2 text-sm">
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] text-[#1E293B]">
            {"<"}
          </button>
          {[1, 2, 3].map((page) => (
            <button
              key={page}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                page === 1
                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                  : "border-[#E2E8F0] text-[#1E293B]"
              }`}
            >
              {page}
            </button>
          ))}
          <span className="px-1 text-[#94A3B8]">...</span>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] text-[#1E293B]">
            9
          </button>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] text-[#1E293B]">
            {">"}
          </button>
        </div>
      </div>
    </div>
  );
}
