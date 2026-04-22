"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, TrendingUp, Building2, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";

import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import {
  SaleSearchBox,
  type SaleSearchFilters,
} from "@/components/search/SaleSearchBox";
import SalePropertyCard from "@/components/cards/SalePropertyCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/types/database";

interface SaleLandingBodyProps {
  mode: "rent" | "sale";
  onModeChange: (mode: "rent" | "sale") => void;
  saleProperties?: Tables<"properties">[];
}

// Convert GEL → USD for display (rough conversion; backend stores GEL).
const GEL_TO_USD = 1 / 2.7;

function toUsd(gel: number | null | undefined): number {
  if (!gel) return 0;
  return Math.round(gel * GEL_TO_USD);
}

// ─── Mock sale properties (used when DB is empty) ──────────────────────

const MOCK_SALES = [
  {
    id: "sale-1",
    title: "საინვესტიციო აპარტამენტი დიდველთან",
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
    ],
    priceUsd: 285_000,
    area: 92,
    rooms: 3,
    isVip: true,
  },
  {
    id: "sale-2",
    title: "სასტუმრო ტიპის ბინა ცენტრში",
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&h=600&fit=crop",
    ],
    priceUsd: 62_400,
    area: 45,
    rooms: 1,
  },
  {
    id: "sale-3",
    title: "ოროთახიანი ბინა ზემო",
    location: "ბაკურიანი, კოხტა",
    photos: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop",
    ],
    priceUsd: 32_000,
    area: 58,
    rooms: 2,
  },
  {
    id: "sale-4",
    title: "ორსართულიანი ხის კოტეჯი",
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&h=600&fit=crop",
    ],
    priceUsd: 135_000,
    area: 160,
    rooms: 4,
  },
  {
    id: "sale-5",
    title: "სტუდიო აპარტამენტი",
    location: "ბაკურიანი, 25-იანები",
    photos: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
    ],
    priceUsd: 32_000,
    area: 28,
    rooms: 1,
  },
  {
    id: "sale-6",
    title: "თანამედროვე ლოფტი",
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop",
    ],
    priceUsd: 52_000,
    area: 70,
    rooms: 2,
  },
];

// ─── Component ──────────────────────────────────────────────────────────

export default function SaleLandingBody({
  mode,
  onModeChange,
  saleProperties,
}: SaleLandingBodyProps) {
  const router = useRouter();

  const handleSearch = useCallback(
    (sf: SaleSearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.propertyType) params.set("type", sf.propertyType);
      if (sf.priceMin) params.set("price_min", String(sf.priceMin));
      if (sf.priceMax) params.set("price_max", String(sf.priceMax));
      if (sf.cadastralCode) params.set("cadastral", sf.cadastralCode);
      params.set("mode", "sale");
      router.push(`/search?${params.toString()}`);
    },
    [router],
  );

  // Build card data — prefer DB, fall back to mocks.
  const saleCards = useMemo(() => {
    if (saleProperties && saleProperties.length > 0) {
      return saleProperties.map((p) => ({
        id: p.id,
        title: p.title,
        location: p.location,
        photos: Array.isArray(p.photos) ? (p.photos as string[]) : [],
        priceUsd: toUsd(p.sale_price ? Number(p.sale_price) : null),
        area: p.area_sqm ?? null,
        rooms: p.rooms,
        isVip: p.is_vip ?? false,
      }));
    }
    return MOCK_SALES;
  }, [saleProperties]);

  const featuredCard = saleCards[0];
  const highlightCard = saleCards[1];
  const gridCards = saleCards.slice(2, 5);
  const allGridCards = saleCards;

  // Stats (synthetic, matches Figma layout)
  const avgPriceUsd = saleCards.length
    ? Math.round(
        saleCards.reduce((sum, c) => sum + c.priceUsd, 0) / saleCards.length,
      )
    : 142_000;

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero (green) ═══ */}
      <section
        className="relative flex min-h-[560px] items-start justify-center overflow-hidden px-4 pb-24 pt-16"
        style={{
          background:
            "linear-gradient(180deg, #0B3A2C 0%, #0F4C3A 55%, #134E3A 100%)",
        }}
      >
        {/* subtle texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&h=600&fit=crop&q=30')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "overlay",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1320px] text-center">
          <ScrollReveal>
            <h1 className="text-3xl font-black leading-[1.05] tracking-[-1.25px] text-white sm:text-4xl md:text-[52px] md:leading-[56px]">
              აღმოაჩინე ბაკურიანში
              <br />
              <span className="text-[#6EE7B7]">შენი ახალი სახლი</span>
            </h1>
          </ScrollReveal>

          <div className="mt-8 flex justify-center">
            <RentBuyToggle value={mode} onChange={onModeChange} />
          </div>

          <div className="mt-6">
            <SaleSearchBox onSearch={handleSearch} />
          </div>

          {/* Stat cards */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="წლიური ზრდა"
              value="16.4%"
              icon={<TrendingUp className="size-[18px] text-[#6EE7B7]" />}
            />
            <StatCard
              label="აქტიური ობიექტი"
              value={`${saleCards.length || 142}`}
              icon={<Building2 className="size-[18px] text-[#6EE7B7]" />}
            />
            <StatCard
              label="საშ. ROI"
              value="+17%"
              icon={<TrendingUp className="size-[18px] text-[#6EE7B7]" />}
            />
            <StatCard
              label="საშ. ფასი"
              value={`$${avgPriceUsd.toLocaleString("en-US")}`}
              icon={<Users className="size-[18px] text-[#052E16]" />}
              highlight
            />
          </div>
        </div>
      </section>

      {/* ═══ 2. Investment Properties ═══ */}
      <section className="mx-auto w-full max-w-[1320px] px-4 py-16">
        <ScrollReveal>
          <div className="mb-6">
            <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
              საინვესტიციო ობიექტები
            </h2>
            <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
              ვერიფიცირებული ბინები და სახლები ინვესტიციისთვის.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {featuredCard && (
            <ScrollReveal>
              <div className="lg:col-span-2">
                <SalePropertyCard {...featuredCard} />
              </div>
            </ScrollReveal>
          )}
          {highlightCard && (
            <ScrollReveal delay={0.1}>
              <InvestmentHighlightCard
                title={highlightCard.title}
                location={highlightCard.location}
                priceUsd={highlightCard.priceUsd}
                href={`/sales/${highlightCard.id}`}
              />
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* ═══ 3. Apartments for Sale in Bakuriani ═══ */}
      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto max-w-[1320px]">
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                  იყიდება ბინები ბაკურიანში
                </h2>
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  შერჩეული 6 ობიექტი შემოწმებული საკუთრების უფლებით.
                </p>
              </div>
              <Link
                href="/sales"
                className="hidden items-center gap-1 rounded-full border border-[#16A34A] bg-white px-4 py-2 text-[13px] font-bold text-[#16A34A] hover:bg-[#F0FDF4] sm:flex"
              >
                ყველას ნახვა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gridCards.map((card) => (
              <ScrollReveal key={card.id}>
                <SalePropertyCard {...card} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. Why Bakuriani is best investment ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-[1320px] rounded-[24px] border border-[#E7EEE9] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(15,61,46,0.06)] md:p-12">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <ScrollReveal>
                <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B] md:text-[30px] md:leading-[36px]">
                  რატომ არის ბაკურიანი საუკეთესო ინვესტიცია?
                </h2>
                <p className="mt-3 text-[14px] font-medium leading-[22px] text-[#64748B]">
                  ბოლო 5 წელიწადში უძრავი ქონების ფასი ბაკურიანში 3-ჯერ
                  გაიზარდა. საშუალო წლიური დატვირთვა 68%-ია, ხოლო ტურისტების
                  ნაკადი ყოველ წელს სტაბილურად იზრდება.
                </p>
              </ScrollReveal>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <InvestmentStat value="16.10%" label="ფასის წლიური ზრდა" />
                <InvestmentStat value="+91,000" label="ტურისტი / წელი" />
              </div>
            </div>

            <ScrollReveal delay={0.1}>
              <div className="flex flex-col items-center gap-4 lg:flex-row lg:gap-8">
                <DonutChart
                  segments={[
                    { value: 42, color: "#16A34A", label: "აპარტამენტი" },
                    { value: 28, color: "#22C55E", label: "კერძო სახლი" },
                    { value: 18, color: "#86EFAC", label: "კომერციული" },
                    { value: 12, color: "#D1FAE5", label: "მიწა" },
                  ]}
                />
                <ul className="flex flex-col gap-2">
                  {[
                    { color: "#16A34A", label: "აპარტამენტი", pct: 42 },
                    { color: "#22C55E", label: "კერძო სახლი", pct: 28 },
                    { color: "#86EFAC", label: "კომერციული", pct: 18 },
                    { color: "#D1FAE5", label: "მიწა", pct: 12 },
                  ].map((s) => (
                    <li
                      key={s.label}
                      className="flex items-center gap-2 text-[12px] font-bold text-[#1E293B]"
                    >
                      <span
                        className="size-3 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                      <span className="text-[#64748B]">{s.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══ 5. Full grid (matches Figma image-3) ═══ */}
      <section className="bg-[#F8FAFC] px-4 py-16">
        <div className="mx-auto max-w-[1320px]">
          <ScrollReveal>
            <div className="mb-6">
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                იყიდება ბინები ბაკურიანში
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                ყველა მოქმედი შეთავაზება ერთ ადგილას.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {allGridCards.map((card) => (
              <ScrollReveal key={`all-${card.id}`}>
                <SalePropertyCard {...card} />
              </ScrollReveal>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/sales"
              className="flex items-center gap-2 rounded-full bg-[#16A34A] px-6 py-3 text-[14px] font-bold text-white hover:bg-[#15803D]"
            >
              ყველა ობიექტი <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Hero stat card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-[16px] border px-5 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1)]",
        highlight
          ? "border-[#6EE7B7] bg-[#16A34A]"
          : "border-white/5 bg-[#123c2f]",
      )}
    >
      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px]",
            highlight ? "text-[#052E16]" : "text-[#94A3B8]",
          )}
        >
          {icon}
          {label}
        </span>
        <span
          className={cn(
            "text-[20px] font-black leading-[28px]",
            highlight ? "text-[#052E16]" : "text-white",
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ─── Investment highlight card (right column of section 2) ─────────────

function InvestmentHighlightCard({
  title,
  location,
  priceUsd,
  href,
}: {
  title: string;
  location: string;
  priceUsd: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col justify-between rounded-[20px] border border-[#E7EEE9] bg-gradient-to-br from-[#F0FDF4] to-white p-6 shadow-[0px_4px_16px_-2px_rgba(15,61,46,0.08)] transition-shadow hover:shadow-[0px_12px_28px_-6px_rgba(15,61,46,0.18)]"
    >
      <div>
        <span className="rounded-full bg-[#16A34A] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-white">
          გამორჩეული ობიექტი
        </span>
        <h3 className="mt-4 text-[20px] font-black leading-[26px] text-[#1E293B]">
          {title}
        </h3>
        <p className="mt-2 text-[13px] font-medium text-[#64748B]">
          {location}
        </p>
      </div>

      <div className="mt-6 flex items-end justify-between">
        <div>
          <span className="block text-[11px] font-bold uppercase tracking-[0.5px] text-[#64748B]">
            ფასი
          </span>
          <span className="block text-[26px] font-black leading-[32px] text-[#16A34A]">
            ${priceUsd.toLocaleString("en-US")}
          </span>
        </div>
        <span className="rounded-[10px] bg-[#16A34A] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#15803D]">
          დეტალები
        </span>
      </div>
    </Link>
  );
}

// ─── Why-invest stat box ────────────────────────────────────────────────

function InvestmentStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[16px] border border-[#E7EEE9] bg-[#F0FDF4] p-5">
      <span className="block text-[24px] font-black leading-[28px] text-[#16A34A]">
        {value}
      </span>
      <span className="mt-1 block text-[12px] font-medium text-[#64748B]">
        {label}
      </span>
    </div>
  );
}

// ─── Donut chart (SVG) ─────────────────────────────────────────────────

function DonutChart({
  segments,
}: {
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  return (
    <svg
      viewBox="0 0 160 160"
      className="size-[160px] -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        stroke="#F1F5F9"
        strokeWidth="22"
      />
      {segments.map((segment, i) => {
        const dash = (segment.value / total) * circumference;
        const gap = circumference - dash;
        const offset = -((accumulated / total) * circumference);
        accumulated += segment.value;
        return (
          <circle
            key={i}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="22"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
}
