"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Home } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import InvestmentCard from "@/components/cards/InvestmentCard";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SalePagination } from "@/components/search/SalePagination";
import { SalesTopBar } from "@/components/layout/SalesTopBar";

const ITEMS_PER_PAGE = 6;

interface Props {
  properties: Tables<"properties">[];
}

export default function SalesPageClient({ properties }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const listingsRef = useRef<HTMLElement>(null);

  const totalPages = Math.max(1, Math.ceil(properties.length / ITEMS_PER_PAGE));

  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return properties.slice(start, start + ITEMS_PER_PAGE);
  }, [properties, currentPage]);

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
          <h1 className="text-[32px] font-black leading-[38px] tracking-[-0.5px] text-[#0F172A] sm:text-[40px] sm:leading-[48px]">
            იყიდება ბინები ბაკურიანში
          </h1>
          <p className="mt-2 text-[14px] leading-[22px] text-[#64748B]">
            მაღალი ROI და მაქსიმალური სარგებელი აქტივში.
          </p>
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
              განცხადებები ვერ მოიძებნა
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              სცადეთ მოგვიანებით
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                    id={p.id}
                    title={p.title}
                    location={p.location}
                    photo={photos[0] ?? "/placeholder-property.jpg"}
                    salePrice={p.sale_price ? Number(p.sale_price) : null}
                    areaSqm={p.area_sqm ? Number(p.area_sqm) : null}
                    roiPercent={p.roi_percent ? Number(p.roi_percent) : null}
                    constructionStatus={p.construction_status}
                    frameType={amenities[0] ?? null}
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
