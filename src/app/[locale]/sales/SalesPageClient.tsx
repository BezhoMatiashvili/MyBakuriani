"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Flame, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { isDiscountActive } from "@/lib/utils/pricing";
import InvestmentCard from "@/components/cards/InvestmentCard";
import { readPaymentOptions } from "@/lib/constants/sale-listing";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SalePagination } from "@/components/search/SalePagination";
import { SalesTopBar } from "@/components/layout/SalesTopBar";
import BannerSlot from "@/components/banners/BannerSlot";

const ITEMS_PER_PAGE = 6;

interface Props {
  properties: Tables<"properties">[];
}

export default function SalesPageClient({ properties }: Props) {
  const t = useTranslations("SalesPage");
  const tShared = useTranslations("Shared");
  const tLanding = useTranslations("Landing");
  const [currentPage, setCurrentPage] = useState(1);
  const [discountOnly, setDiscountOnly] = useState(false);
  const listingsRef = useRef<HTMLElement>(null);

  const filteredProperties = useMemo(
    () =>
      discountOnly
        ? properties.filter((p) =>
            isDiscountActive(p.discount_percent, p.discount_expires_at),
          )
        : properties,
    [properties, discountOnly],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProperties.length / ITEMS_PER_PAGE),
  );

  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProperties.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProperties, currentPage]);

  // Safety net for `properties` itself shrinking (ISR revalidate). The toggle
  // resets the page in its own handler instead, because this effect only runs
  // after a commit — from page 3 it would flash the empty state for a frame.
  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    listingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SalesTopBar />

      <section className="mx-auto w-full max-w-[1160px] px-4 pb-6 pt-10 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[32px] font-black leading-[38px] tracking-[-0.5px] text-[#0F172A] sm:text-[40px] sm:leading-[48px]">
                {t("title")}
              </h1>
              <p className="mt-2 text-[14px] leading-[22px] text-[#64748B]">
                {t("subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDiscountOnly((value) => !value);
                  setCurrentPage(1);
                }}
                aria-pressed={discountOnly}
                className={cn(
                  "inline-flex items-center gap-3 rounded-full px-4 py-2 text-[12px] font-bold transition-colors",
                  discountOnly
                    ? "border border-[#F97316]/30 bg-[#FFF7ED] text-[#F97316]"
                    : "border border-[#E2E8F0] bg-white text-[#64748B]",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5" />
                  {tLanding("discountsOnly")}
                </span>
                <span
                  className={cn(
                    "relative inline-flex h-[20px] w-[40px] items-center rounded-full transition-colors",
                    discountOnly ? "bg-[#F97316]" : "bg-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute size-[16px] rounded-full bg-white shadow-sm transition-all",
                      discountOnly ? "right-0.5" : "left-0.5",
                    )}
                  />
                </span>
              </button>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <section
        ref={listingsRef}
        className="mx-auto w-full max-w-[1160px] px-4 pb-20 sm:px-6 lg:px-8"
      >
        {paginatedProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <Home className="h-8 w-8 text-[#94A3B8]" />
            </div>
            <h3 className="text-[17px] font-black leading-[21px] text-[#1E293B]">
              {tShared("noListingsFound")}
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              {discountOnly ? tShared("tryChangeFilters") : t("tryLater")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-6">
            <BannerSlot
              placement="listing_top"
              bare
              className="col-span-full"
            />
            <BannerSlot placement="listing_grid" bare />

            {paginatedProperties.map((p, i) => {
              const photos = Array.isArray(p.photos)
                ? (p.photos as string[])
                : [];
              const amenities = Array.isArray(p.amenities)
                ? (p.amenities as string[])
                : [];
              return (
                <ScrollReveal key={p.id} delay={i * 0.05}>
                  <InvestmentCard
                    mobilePresentation="compact-grid"
                    id={p.id}
                    title={p.title}
                    location={p.location}
                    photo={photos[0] ?? "/placeholder-property.jpg"}
                    salePrice={p.sale_price ? Number(p.sale_price) : null}
                    type={p.type}
                    areaSqm={p.area_sqm ? Number(p.area_sqm) : null}
                    roiPercent={p.roi_percent ? Number(p.roi_percent) : null}
                    constructionStatus={p.construction_status}
                    frameType={amenities[0] ?? null}
                    paymentOptions={readPaymentOptions(p.house_rules)}
                    discountPercent={p.discount_percent ?? 0}
                    discountExpiresAt={p.discount_expires_at}
                  />
                </ScrollReveal>
              );
            })}
          </div>
        )}

        <SalePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      </section>
    </div>
  );
}
