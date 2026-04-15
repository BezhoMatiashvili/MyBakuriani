"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";

type Tx = {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  user: { display_name: string } | null;
};

type FinanceSummary = {
  gross: number;
  net: number;
  completedRevenue: number;
  perListing: number;
  recent: Tx[];
};

function formatDateTime(input: string | null) {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ka-GE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFinancesPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/finances/summary", {
      cache: "no-store",
    });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "ჩატვირთვა ვერ მოხერხდა");
      setSummary(null);
    } else {
      setSummary(payload as FinanceSummary);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!summary) return;
    setExporting(true);
    try {
      const header = "date,user,type,description,amount\n";
      const rows = summary.recent
        .map((t) =>
          [
            t.created_at,
            t.user?.display_name ?? "",
            t.type,
            (t.description ?? "").replace(/,/g, ";"),
            t.amount,
          ].join(","),
        )
        .join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mybakuriani-transactions-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const metrics = [
    {
      label: "მთლიანი შემოსავალი",
      value: summary ? `${formatPrice(summary.gross)}` : "—",
      containerClassName: "border-[#E2E8F0] bg-white",
      labelClassName: "text-[#94A3B8]",
      valueClassName: "text-[#1E293B]",
    },
    {
      label: "სუფთა შემოსავალი",
      value: summary ? `${formatPrice(summary.net)}` : "—",
      containerClassName: "border-[#A7F3D0] bg-[#ECFDF5]",
      labelClassName: "text-[#059669]",
      valueClassName: "text-[#047857]",
    },
    {
      label: "შემოსავალი ობიექტზე",
      value: summary ? `${formatPrice(summary.perListing)}` : "—",
      containerClassName: "border-[#1E293B] bg-[#0F172A]",
      labelClassName: "text-[#CBD5E1]",
      valueClassName: "text-white",
    },
  ];

  return (
    <div className="flex min-h-full w-full flex-1 flex-col pb-10">
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8">
        <div className="flex flex-col gap-5 pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
              ფინანსური მიმოხილვა
            </h1>
            <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
              ფულადი ნაკადების და საშუალო შემოსავლის მართვა.
            </p>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || loading || !summary}
            className="inline-flex h-[44px] min-h-[44px] items-center justify-center gap-2 self-start rounded-xl border border-[#A7F3D0] bg-white px-5 text-[13px] font-bold text-[#059669] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 sm:self-auto"
          >
            {exporting ? (
              <Loader2 className="h-[13px] w-[13px] animate-spin" />
            ) : (
              <Download className="h-[13px] w-[13px]" />
            )}
            CSV ექსპორტი
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-[18px]">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className={`rounded-[24px] border px-6 py-6 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] ${metric.containerClassName}`}
            >
              <p
                className={`text-[11px] font-bold uppercase tracking-[1.1px] ${metric.labelClassName}`}
              >
                {metric.label}
              </p>
              <p
                className={`mt-2 text-[42px] font-black leading-[1] tracking-[-0.6px] ${metric.valueClassName}`}
              >
                {loading ? "..." : metric.value}
              </p>
            </article>
          ))}
        </div>

        <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <header className="flex items-center bg-[#F8FAFC] px-6 py-6">
            <h2 className="text-[16px] font-black leading-6 text-[#1E293B]">
              ბოლო ტრანზაქციები
            </h2>
          </header>

          <div className="flex-1 space-y-2 p-4 sm:p-5">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-[74px] w-full rounded-xl" />
              ))
            ) : !summary || summary.recent.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-[#94A3B8]">
                ტრანზაქცია ჯერ არ არის
              </div>
            ) : (
              summary.recent.map((transaction) => {
                const positive = transaction.amount >= 0;
                const Icon = positive ? ArrowDown : ArrowUp;
                return (
                  <article
                    key={transaction.id}
                    className="flex min-h-[74px] flex-col gap-3 rounded-xl bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                          positive
                            ? "border-[#E2E8E5] bg-[#ECFDF5] text-[#10B981]"
                            : "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                        }`}
                      >
                        <Icon className="h-[14px] w-[14px]" />
                      </span>
                      <div>
                        <p className="text-[14px] font-bold leading-[21px] text-[#1E293B]">
                          {transaction.description ?? transaction.type}
                        </p>
                        <p className="text-[11px] font-medium leading-4 text-[#64748B]">
                          {transaction.user?.display_name ?? "—"} •{" "}
                          {formatDateTime(transaction.created_at)}
                        </p>
                      </div>
                    </div>

                    <p
                      className={`text-left text-[16px] font-black leading-6 sm:text-right ${
                        positive ? "text-[#059669]" : "text-[#DC2626]"
                      }`}
                    >
                      {positive ? "+ " : "- "}
                      {formatPrice(Math.abs(transaction.amount))}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
