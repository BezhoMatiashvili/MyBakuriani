"use client";

import { useMemo, useState, useEffect } from "react";
import { Home } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Tables } from "@/lib/types/database";
import PropertyCard from "@/components/cards/PropertyCard";
import { readPaymentOptions } from "@/lib/constants/sale-listing";
import ScrollReveal from "@/components/shared/ScrollReveal";
import { SalePagination } from "@/components/search/SalePagination";
import { cn } from "@/lib/utils";
import { isDiscountActive } from "@/lib/utils/pricing";
import BannerSlot from "@/components/banners/BannerSlot";

const ITEMS_PER_PAGE = 6;

type ListingTab = "all" | "vip" | "discount";

interface Props {
  properties: Tables<"properties">[];
  initialType?: string;
  initialTypes?: string[];
  initialLocation?: string;
  initialPriceMin?: number;
  initialPriceMax?: number;
  initialAreaMin?: number;
  initialAreaMax?: number;
  initialCadastral?: string;
  initialStatuses?: string[];
  initialRooms?: number[];
  initialAmenities?: string[];
  initialPayment?: string[];
  initialDevelopers?: string[];
  initialSellerTypes?: string[];
  initialRoiMin?: number;
  initialConstruction?: string;
  initialRenovation?: string;
}

// Data-matching regexes against the free-text construction_status DB column —
// the Georgian fragments here are values, not UI copy.
const STATUS_MAP: Record<string, RegExp> = {
  new: /(ახალი|new)/i,
  progress: /(მიმდინარე|progress|under)/i,
  ready: /(მზად|ready|complete|დასრულ|old[_\s-]?built|ძველი)/i,
};

// Sale-tab `construction` URL param uses the Figma-aligned values which map
// onto the existing free-text `construction_status` column.
const CONSTRUCTION_MAP: Record<string, RegExp> = {
  completed: /(დასრულ|completed|complete|მზა|ready|old[_\s-]?built|ძველი)/i,
  under_construction: /(მშენებარე|under|progress|in_progress)/i,
};

export default function SalesGridClient({
  properties,
  initialType,
  initialTypes,
  initialLocation,
  initialPriceMin,
  initialPriceMax,
  initialAreaMin,
  initialAreaMax,
  initialCadastral,
  initialStatuses,
  initialRooms,
  initialAmenities,
  initialPayment,
  initialDevelopers,
  initialSellerTypes,
  initialRoiMin,
  initialConstruction,
  initialRenovation,
}: Props) {
  const t = useTranslations("SalesGrid");
  const tShared = useTranslations("Shared");
  const [currentPage, setCurrentPage] = useState(1);
  const [listingTab, setListingTab] = useState<ListingTab>("all");

  const filteredProperties = useMemo(() => {
    let list = properties;

    const typePool = new Set<string>();
    if (initialType) typePool.add(initialType);
    for (const t of initialTypes ?? []) typePool.add(t);
    if (typePool.size > 0) {
      list = list.filter((p) => p.type && typePool.has(p.type));
    }

    if (initialLocation) {
      list = list.filter((p) =>
        p.location?.toLowerCase().includes(initialLocation.toLowerCase()),
      );
    }
    if (initialPriceMin != null) {
      list = list.filter(
        (p) => Number(p.sale_price ?? 0) >= (initialPriceMin ?? 0),
      );
    }
    if (initialPriceMax != null) {
      list = list.filter(
        (p) => Number(p.sale_price ?? 0) <= (initialPriceMax ?? Infinity),
      );
    }
    if (initialAreaMin != null) {
      list = list.filter(
        (p) => Number(p.area_sqm ?? 0) >= (initialAreaMin ?? 0),
      );
    }
    if (initialAreaMax != null) {
      list = list.filter(
        (p) => Number(p.area_sqm ?? 0) <= (initialAreaMax ?? Infinity),
      );
    }
    if (initialCadastral) {
      list = list.filter((p) =>
        p.cadastral_code
          ?.toLowerCase()
          .includes(initialCadastral.toLowerCase()),
      );
    }
    if (initialStatuses && initialStatuses.length > 0) {
      list = list.filter((p) => {
        const status = (p.construction_status ?? "").toLowerCase();
        return initialStatuses.some((s) => STATUS_MAP[s]?.test(status));
      });
    }
    if (initialRooms && initialRooms.length > 0) {
      list = list.filter((p) => {
        if (p.rooms == null) return false;
        const has4Plus = initialRooms.includes(4);
        if (has4Plus && p.rooms >= 4) return true;
        return initialRooms.includes(p.rooms);
      });
    }
    if (initialAmenities && initialAmenities.length > 0) {
      list = list.filter((p) => {
        const amenities = Array.isArray(p.amenities)
          ? (p.amenities as string[])
          : [];
        return initialAmenities.every((a) => amenities.includes(a));
      });
    }
    if (initialPayment && initialPayment.length > 0) {
      list = list.filter((p) => {
        const paymentOptions: string[] = readPaymentOptions(p.house_rules);
        return initialPayment.some((pay) => paymentOptions.includes(pay));
      });
    }
    if (initialDevelopers && initialDevelopers.length > 0) {
      list = list.filter(
        (p) => p.developer && initialDevelopers.includes(p.developer),
      );
    }
    if (initialSellerTypes && initialSellerTypes.length > 0) {
      const wantsDeveloper = initialSellerTypes.includes("developer");
      const wantsIndividual = initialSellerTypes.includes("individual");
      if (wantsDeveloper !== wantsIndividual) {
        // A "developer" listing is company-linked (organization_id) or carries
        // legacy free-text developer branding.
        const isCompanyListing = (p: (typeof list)[number]) =>
          p.organization_id != null ||
          (p.developer != null && p.developer !== "");
        list = list.filter((p) =>
          wantsDeveloper ? isCompanyListing(p) : !isCompanyListing(p),
        );
      }
    }
    if (initialRoiMin != null) {
      list = list.filter(
        (p) => p.roi_percent != null && Number(p.roi_percent) >= initialRoiMin,
      );
    }
    if (initialConstruction) {
      const matcher = CONSTRUCTION_MAP[initialConstruction];
      list = list.filter((p) => {
        const status = p.construction_status ?? "";
        return matcher ? matcher.test(status) : status === initialConstruction;
      });
    }
    if (initialRenovation) {
      list = list.filter((p) => p.renovation_status === initialRenovation);
    }

    if (listingTab === "vip") {
      list = list.filter((p) => p.is_vip || p.is_super_vip);
    }
    if (listingTab === "discount") {
      list = list.filter((p) =>
        isDiscountActive(p.discount_percent, p.discount_expires_at),
      );
    }

    return list;
  }, [
    properties,
    listingTab,
    initialType,
    initialTypes,
    initialLocation,
    initialPriceMin,
    initialPriceMax,
    initialAreaMin,
    initialAreaMax,
    initialCadastral,
    initialStatuses,
    initialRooms,
    initialAmenities,
    initialPayment,
    initialDevelopers,
    initialSellerTypes,
    initialRoiMin,
    initialConstruction,
    initialRenovation,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProperties.length / ITEMS_PER_PAGE),
  );
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProperties.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProperties, currentPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [listingTab]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <section className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-12">
        <ScrollReveal>
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[32px] sm:leading-[40px]">
                {t("title")}
              </h1>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                {t("subtitle")}
                {filteredProperties.length > 0 && (
                  <span className="ml-1 text-[#94A3B8]">
                    ·{" "}
                    {tShared("listingsCount", {
                      count: filteredProperties.length,
                    })}
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white p-1">
              {(
                [
                  { id: "all", label: t("tabAll") },
                  { id: "vip", label: "VIP" },
                  { id: "discount", label: t("tabDiscount") },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setListingTab(tab.id)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors",
                    listingTab === tab.id
                      ? "bg-[#16A34A] text-white"
                      : "text-[#64748B] hover:text-[#1E293B]",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {paginatedProperties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC]">
              <Home className="h-8 w-8 text-[#94A3B8]" />
            </div>
            <h3 className="text-[17px] font-black leading-[21px] text-[#1E293B]">
              {tShared("noListingsFound")}
            </h3>
            <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
              {tShared("tryChangeFilters")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            <BannerSlot
              placement="listing_top"
              bare
              className="col-span-full"
            />
            <BannerSlot placement="listing_grid" bare />

            {paginatedProperties.map((p, i) => (
              <ScrollReveal key={p.id} delay={i * 0.05}>
                <PropertyCard
                  id={p.id}
                  createdAt={p.created_at}
                  title={p.title}
                  location={p.location}
                  photos={p.photos ?? []}
                  pricePerNight={
                    p.price_per_night ? Number(p.price_per_night) : null
                  }
                  salePrice={p.sale_price ? Number(p.sale_price) : null}
                  rating={null}
                  capacity={p.capacity}
                  rooms={p.rooms}
                  isVip={p.is_vip ?? false}
                  isSuperVip={p.is_super_vip ?? false}
                  discountPercent={p.discount_percent ?? 0}
                  discountExpiresAt={p.discount_expires_at}
                  isForSale
                  amenityTags={
                    Array.isArray(p.amenities) ? (p.amenities as string[]) : []
                  }
                  constructionStatus={p.construction_status ?? null}
                  constructionProgressPercent={
                    p.construction_progress_percent ?? null
                  }
                  paymentOptions={readPaymentOptions(p.house_rules)}
                />
              </ScrollReveal>
            ))}
          </div>
        )}

        <SalePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
}
