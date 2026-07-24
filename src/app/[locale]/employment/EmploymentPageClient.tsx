"use client";
import { useState, useMemo } from "react";
import { Search, Briefcase, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import type { Tables } from "@/lib/types/database";
import EmploymentCard from "@/components/cards/EmploymentCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import BannerSlot from "@/components/banners/BannerSlot";

// `value` is matched against DB `position` values and must stay Georgian.
const POSITIONS = [
  { value: "all", key: "all" },
  { value: "დამლაგებელი", key: "cleaner" },
  { value: "მიმტანი", key: "waiter" },
  { value: "ბარმენი", key: "bartender" },
  { value: "ადმინისტრატორი", key: "administrator" },
  { value: "სხვა", key: "other" },
] as const;

const SCHEDULES = ["all", "fulltime", "parttime", "seasonal", "other"] as const;

const ITEMS_PER_PAGE = 9;

const POSTED_KEYS = ["today", "days3", "days5", "week1", "weeks2"] as const;

interface Props {
  services: Tables<"services">[];
  cvCounts: Record<string, number>;
}

function deriveBadge(
  s: Tables<"services">,
  index: number,
): "urgent" | "vip" | "new" | null {
  if (s.is_vip) return "vip";
  if (s.discount_percent && s.discount_percent > 0) return "urgent";
  if (index < 2) return "new";
  return null;
}

export default function EmploymentPageClient({ services, cvCounts }: Props) {
  const t = useTranslations("EmploymentPage");
  const tShared = useTranslations("Shared");
  const tOpts = useTranslations("ListingOptions");

  const salaryLabel = (s: Tables<"services">): string | null => {
    if (s.salary_daily != null)
      return t("salaryDaily", { amount: s.salary_daily });
    if (s.salary_min != null && s.salary_max != null) {
      return `${s.salary_min} - ${s.salary_max} ₾`;
    }
    if (s.price != null) {
      const unitPath = priceUnitPathFor(s.price_unit);
      const unit = unitPath ? tOpts(unitPath) : s.price_unit;
      return `${s.price} ₾${unit ? ` / ${unit}` : ""}`;
    }
    return null;
  };

  // Rows store Georgian enum labels (e.g. "მოქნილი"); resolve to the
  // ListingOptions translation, passing unknown free-text through raw.
  const scheduleLabel = (s: Tables<"services">): string | null => {
    const raw = s.work_schedule ?? s.employment_schedule;
    if (!raw) return null;
    const key = optionKeyFor("employmentTypes", raw);
    return key ? tOpts(`employmentTypes.${key}`) : raw;
  };

  const [activePosition, setActivePosition] = useState<string>("all");
  const [activeSchedule, setActiveSchedule] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (activePosition !== "all") {
        if ((s.position ?? "") !== activePosition) return false;
      }
      if (activeSchedule !== "all") {
        if (activeSchedule === "other") {
          if (
            ["fulltime", "parttime", "seasonal"].includes(
              s.employment_type ?? "",
            )
          )
            return false;
        } else if ((s.employment_type ?? "") !== activeSchedule) {
          return false;
        }
      }
      if (
        searchQuery &&
        !s.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [services, activePosition, activeSchedule, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <section
        className="relative px-4 pt-16 pb-20 text-center"
        style={{
          background: "linear-gradient(135deg, #0E2150 0%, #1E3A7B 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h1 className="text-[36px] font-black leading-[44px] sm:text-[48px] sm:leading-[56px]">
              <span className="text-[#60A5FA]">{t("heroTitle1")}</span>{" "}
              <span className="text-white">{t("heroTitle2")}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-[24px] text-white/70">
              {t("heroSubtitle")}
            </p>
          </ScrollReveal>
          <div className="mx-auto mt-8 flex max-w-[720px] items-center gap-2 rounded-full bg-white p-2 shadow-lg">
            <div className="flex flex-1 items-center gap-2 pl-4">
              <Search className="h-5 w-5 text-[#94A3B8]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("searchPlaceholder")}
                className="h-10 w-full border-0 bg-transparent text-sm text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
              />
            </div>
            <button
              type="button"
              className="h-10 shrink-0 rounded-full bg-[#2563EB] px-6 text-sm font-bold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              {t("search")}
            </button>
          </div>
        </div>
      </section>

      <section className="px-4">
        <div className="relative z-10 mx-auto -mt-16 max-w-7xl rounded-[28px] bg-white p-6 shadow-[0px_10px_40px_-8px_rgba(15,23,42,0.15)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              {t("positionLabel")}
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {POSITIONS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => {
                    setActivePosition(cat.value);
                    setCurrentPage(1);
                  }}
                  className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    activePosition === cat.value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {t(`positions.${cat.key}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="my-5 h-px w-full bg-[#E2E8F0]" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1.5px] text-[#94A3B8] sm:w-[140px]">
              {t("scheduleLabel")}
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {SCHEDULES.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setActiveSchedule(value);
                    setCurrentPage(1);
                  }}
                  className={`shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    activeSchedule === value
                      ? "bg-[#2563EB] text-white shadow-[0px_4px_10px_-2px_rgba(37,99,235,0.35)]"
                      : "bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9]"
                  }`}
                >
                  {t(`schedules.${value}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <h2 className="mb-6 text-[28px] font-black leading-[34px] text-[#1E293B]">
          {t("vacancies", { count: filtered.length })}
        </h2>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <Briefcase className="h-8 w-8 text-[#64748B]" />
            </div>
            <h3 className="text-[17px] font-black text-[#1E293B]">
              {t("noVacancies")}
            </h3>
            <p className="mt-1 text-sm text-[#64748B]">
              {tShared("tryChangeFilters")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <BannerSlot placement="listing_top" bare className="col-span-full" />
            <BannerSlot placement="listing_grid" bare />

              {paginated.map((s, i) => (
                <ScrollReveal key={s.id} delay={i * 0.05}>
                  <EmploymentCard
                    id={s.id}
                    title={s.position ?? s.title}
                    employer={s.title}
                    location={s.location}
                    salaryLabel={salaryLabel(s)}
                    scheduleLabel={scheduleLabel(s)}
                    description={s.description}
                    badge={deriveBadge(s, i)}
                    postedLabel={t(
                      `posted.${POSTED_KEYS[i % POSTED_KEYS.length]}`,
                    )}
                    applicationsCount={cvCounts[s.id] ?? 0}
                    highlighted={s.is_vip ?? false}
                  />
                </ScrollReveal>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      currentPage === p
                        ? "bg-[#2563EB] text-white"
                        : "border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
