"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Gift,
  LogOut,
  Phone,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, formatPrice } from "@/lib/utils/format";
import type { Tables, Enums } from "@/lib/types/database";

type ProfileWithCounts = Tables<"profiles"> & {
  listings_count: number;
  balance_amount: number;
};

const PAGE_SIZE = 2;

const roleLabels: Record<Enums<"user_role">, string> = {
  guest: "სტუმარი",
  renter: "დამქირავებელი",
  seller: "გამყიდველი",
  cleaner: "დამლაგებელი",
  food: "კვება",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  employment: "დასაქმება",
  handyman: "ხელოსანი",
  admin: "ადმინი",
};

const roleBadgeClasses: Record<Enums<"user_role">, string> = {
  guest: "border border-[#E2E8F0] bg-[#ECFDF5] text-[#475569]",
  renter: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  seller: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  cleaner: "bg-[#FCE7F3] text-[#BE185D]",
  food: "bg-[#FEE2E2] text-[#B91C1C]",
  entertainment: "bg-[#FEF3C7] text-[#92400E]",
  transport: "bg-[#E0F2FE] text-[#0369A1]",
  employment: "bg-[#F3E8FF] text-[#7E22CE]",
  handyman: "bg-[#CCFBF1] text-[#0F766E]",
  admin: "bg-[#DCFCE7] text-[#166534]",
};

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const [page, setPage] = useState(1);
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileWithCounts | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        if (profilesData) {
          const [{ data: propertiesData }, { data: balancesData }] =
            await Promise.all([
              supabase.from("properties").select("owner_id"),
              supabase.from("balances").select("user_id, amount"),
            ]);

          const countMap = new Map<string, number>();
          propertiesData?.forEach((p) => {
            countMap.set(p.owner_id, (countMap.get(p.owner_id) ?? 0) + 1);
          });
          const balanceMap = new Map<string, number>();
          balancesData?.forEach((b) => {
            balanceMap.set(b.user_id, Number(b.amount ?? 0));
          });

          const enriched: ProfileWithCounts[] = profilesData.map((p) => ({
            ...p,
            listings_count: countMap.get(p.id) ?? 0,
            balance_amount: balanceMap.get(p.id) ?? 0,
          }));
          setProfiles(enriched);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => profiles, [profiles]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageWindow = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i += 1
    ) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <div className="flex items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[32px] font-black leading-[32px] tracking-[-0.8px] text-[#0F172A]">
            მომხმარებლები
          </h1>
          <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
            მართეთ მომხმარებლები, შეამოწმეთ ისტორია ან აჩუქეთ ბალანსი.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[42px] items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-sm hover:bg-[#F8FAFC]"
        >
          <Download className="h-[13px] w-[13px]" />
          ექსპორტი
        </button>
      </div>

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-[48px] border-b border-[#E2E8F0] bg-[rgba(248,250,252,0.8)] px-6 py-5 text-[12px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
          <span>კლიენტი</span>
          <span>როლი / სტატუსი</span>
          <span className="text-right">ოპერაციები</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          paginated.map((profile) => (
            <div
              key={profile.id}
              className="grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-[48px] border-b border-[#F1F5F9] px-6 py-[18px] last:border-b-0"
            >
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(profile)}
                    className="text-left text-[16px] font-black leading-[21px] text-[#1E293B] hover:text-[#2563EB]"
                  >
                    {profile.display_name}
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-[#64748B]">
                    <Phone className="h-[14px] w-[14px] shrink-0 text-[#2563EB]" />
                    {formatPhone(profile.phone)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span
                  className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-black leading-[15px] tracking-[0.275px] ${roleBadgeClasses[profile.role]}`}
                >
                  {roleLabels[profile.role]}
                </span>
                <p className="text-[12px] font-semibold leading-[16px] text-[#64748B]">
                  ბალანსი: {formatPrice(profile.balance_amount)}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProfile(profile)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[12px] bg-[#EFF6FF] px-3.5 text-[12px] font-bold text-[#2563EB] hover:bg-[#DBEAFE]"
                >
                  <RefreshCcw className="h-3 w-3" />
                  ისტორია
                </button>
                <button
                  type="button"
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-[12px] border border-[#D1FAE5] bg-[#ECFDF5] px-3.5 text-[12px] font-bold text-[#10B981] hover:bg-[#D1FAE5]"
                >
                  <Gift className="h-3 w-3" />
                  ბონუსი
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:bg-white"
                >
                  <LogOut className="h-[13px] w-[13px]" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] hover:bg-white"
                >
                  <Ban className="h-[13px] w-[13px]" />
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#334155]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow.map((entry, idx) =>
          entry === "..." ? (
            <span key={`dots-${idx}`} className="px-1 text-xl text-[#94A3B8]">
              ...
            </span>
          ) : (
            <button
              type="button"
              key={entry}
              onClick={() => setPage(entry)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                page === entry
                  ? "border-[#3B82F6] bg-[#3B82F6] text-white"
                  : "border-[#E2E8F0] bg-white text-[#334155]"
              }`}
            >
              {entry}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#334155]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {selectedProfile ? (
        <div
          className="fixed bottom-0 right-0 top-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.6)] p-4 backdrop-blur-[2px] md:left-[281px]"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="flex h-auto w-full max-w-[700px] flex-col rounded-[32px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
              <div className="flex min-h-10 items-center gap-3 pt-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF]">
                  <UserRound className="h-[17px] w-[17px] text-[#2563EB]" />
                </div>
                <h2 className="flex flex-wrap items-center gap-1.5 text-[20px] font-black leading-[30px] text-[#1E293B]">
                  <span>მომხმარებლის დეტალები:</span>
                  <span className="text-[#2563EB]">
                    {selectedProfile.display_name}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="space-y-6 px-8 pb-8 pt-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-[#FFEDD5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#F97316]">
                    VIP გამოყენება
                  </p>
                  <p className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    5-ჯერ
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#EEF1F4] bg-[#F8FAFC] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#9333EA]">
                    პრომო კოდი
                  </p>
                  <p className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    2-ჯერ
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#E2E8E5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#10B981]">
                    LTV (ჯამური ხარჯი)
                  </p>
                  <p className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    145.00 ₾
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="px-6 py-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[1.3px] text-[#64748B]">
                    ტრანზაქციების ისტორია
                  </h3>
                </div>
                <div className="max-h-[195px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-[#F8FAFC]">
                      <tr className="border-y border-[#E2E8F0]">
                        <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                          თარიღი
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                          მოქმედება
                        </th>
                        <th className="px-6 py-3 text-right text-[11px] font-bold uppercase text-[#94A3B8]">
                          თანხა
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr className="border-t border-[#F1F5F9]">
                        <td className="px-6 py-[17px] text-[13px] font-bold text-[#475569]">
                          14 თებ. 2026
                        </td>
                        <td className="px-6 py-[17px] text-[13px] font-medium text-[#334155]">
                          VIP ამოწევა (ბინა ID: PR-8842)
                        </td>
                        <td className="px-6 py-[16.5px] text-right text-[14px] font-black text-[#EF4444]">
                          - 1.50 ₾
                        </td>
                      </tr>
                      <tr className="border-t border-[#F1F5F9]">
                        <td className="px-6 py-[17px] text-[13px] font-bold text-[#475569]">
                          12 თებ. 2026
                        </td>
                        <td className="px-6 py-[17px] text-[13px] font-medium text-[#334155]">
                          სეზონური ვერიფიკაცია (FB პაკეტი)
                        </td>
                        <td className="px-6 py-[16.5px] text-right text-[14px] font-black text-[#EF4444]">
                          - 30.00 ₾
                        </td>
                      </tr>
                      <tr className="border-t border-[#F1F5F9]">
                        <td className="px-6 py-[17px] text-[13px] font-bold text-[#475569]">
                          10 თებ. 2026
                        </td>
                        <td className="px-6 py-[17px] text-[13px] font-medium text-[#334155]">
                          ბალანსის შევსება (Unipay)
                        </td>
                        <td className="px-6 py-4 text-right text-[14px] font-black text-[#10B981]">
                          + 50.00 ₾
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
