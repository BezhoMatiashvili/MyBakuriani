"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  ChevronDown,
  Check,
  Home,
  Map as MapIcon,
  SlidersHorizontal,
  BedDouble,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { createClient } from "@/lib/supabase/client";
import { sanitizeCadastralCode } from "@/lib/utils/number";
import BottomSheet from "@/components/shared/BottomSheet";

// Seeded zone slugs have display translations under Zones.<slug>; unknown
// (admin-created) zones fall back to their Georgian name_ka. Display only —
// submitted/compared zone values must stay name_ka (zone matching uses it).
const TRANSLATED_ZONE_SLUGS = new Set<string>(
  FALLBACK_ZONES.map((z) => z.slug),
);

function zoneDisplayName(
  zones: Zone[],
  tZones: (key: string) => string,
  nameKa: string,
): string {
  const slug = zones.find((z) => z.name_ka === nameKa)?.slug;
  return slug && TRANSLATED_ZONE_SLUGS.has(slug)
    ? tZones(`${slug}.name`)
    : nameKa;
}

function nearestZoneNameFrom(
  zones: Zone[],
  lat: number,
  lng: number,
): string | null {
  if (zones.length === 0) return null;
  let best = zones[0];
  let bestDist = Infinity;
  for (const z of zones) {
    const dLat = lat - z.lat;
    const dLng = lng - z.lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestDist) {
      bestDist = d;
      best = z;
    }
  }
  return best.name_ka;
}

// ─── Types ─────────────────────────────────────────────────────────────

export interface SaleSearchFilters {
  location: string;
  propertyType: string;
  propertyTypes: string[];
  priceMin: number;
  priceMax: number;
  cadastralCode: string;
  statuses: string[];
  rooms: number[];
  areaMin: number;
  areaMax: number;
  amenities: string[];
  payment: string[];
  developers: string[];
  sellerTypes: string[];
  // Investment-mode quick filters (from the 4-dropdown row):
  roiMin: number | null; // 5 | 8 | 10 | null
  constructionStatus: string | null; // "completed" | "under_construction" | null
  renovationStatus: string | null; // "black_frame" | "white_frame" | "furnished" | null
}

type SaleTab = "search" | "appraise";

type SaleActiveDropdown =
  | "type"
  | "rooms"
  | "filters"
  | "roi"
  | "area"
  | "status"
  | "renovation"
  | "zone"
  | null;

type MobileFilterDraft = {
  propertyTypes: string[];
  priceMin: string;
  priceMax: string;
  cadastralCode: string;
  statuses: string[];
  rooms: number[];
  areaMin: number;
  areaMax: number;
  amenities: string[];
  payment: string[];
  developers: string[];
  sellerTypes: string[];
  roiMin: number | null;
  areaBucket: AreaBucket;
  constructionStatus: string | null;
  renovationStatus: string | null;
};

interface SaleSearchBoxProps {
  onSearch: (filters: SaleSearchFilters) => void;
  className?: string;
  isPending?: boolean;
  showInvestmentFilters?: boolean;
  /** Controlled map-toggle state. If omitted, the component manages its own. */
  showMap?: boolean;
  onShowMapChange?: (next: boolean) => void;
  zones: Zone[];
}

// ─── Option constants ──────────────────────────────────────────────────
// `value` fields are data sent to filters/APIs; labels resolve via
// translation keys at render time.

const PROPERTY_TYPES = [
  { value: "apartment", labelKey: "typeApartment" },
  { value: "studio", labelKey: "typeStudio" },
  { value: "villa", labelKey: "typeVilla" },
  { value: "land", labelKey: "typeLand" },
  { value: "cottage", labelKey: "typeCottage" },
  { value: "hotel", labelKey: "typeHotel" },
];

const STATUS_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "new", labelKey: "statusNew" },
  { value: "progress", labelKey: "statusInProgress" },
  { value: "ready", labelKey: "statusReady" },
];

const PAYMENT_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "cash", labelKey: "paymentCash" },
  { value: "installment", labelKey: "paymentInstallment" },
  { value: "mortgage", labelKey: "paymentMortgage" },
];

const ROOM_OPTIONS = [1, 2, 3, 4] as const;

// Chip `value`s are Georgian data values matched against DB amenities —
// they intentionally stay Georgian; only the visible label is translated.
const AMENITY_CHIPS: Array<{ value: string; labelKey: string }> = [
  { value: "აივანი", labelKey: "amenityBalcony" },
  { value: "ფარდული", labelKey: "amenityShed" },
  { value: "წყალი", labelKey: "amenityWater" },
  { value: "გაზი", labelKey: "amenityGas" },
  { value: "ავეჯი", labelKey: "amenityFurniture" },
];

const DEVELOPER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Moritori Gardens", label: "Moritori Gardens" },
  { value: "Crystal Resort", label: "Crystal Resort" },
  { value: "Mountain Dev Group", label: "Mountain Dev Group" },
  { value: "Bakuriani Invest", label: "Bakuriani Invest" },
];

const SELLER_TYPE_OPTIONS: Array<{
  value: "developer" | "individual";
  labelKey: string;
}> = [
  { value: "developer", labelKey: "sellerDeveloper" },
  { value: "individual", labelKey: "sellerIndividual" },
];

// Investment quick-filter options (from Figma)
const ROI_OPTIONS: Array<{ value: number | null }> = [
  { value: null },
  { value: 5 },
  { value: 8 },
  { value: 10 },
];

type AreaBucket = "20-40" | "40-70" | "70+" | null;
const AREA_OPTIONS: Array<{ value: AreaBucket }> = [
  { value: null },
  { value: "20-40" },
  { value: "40-70" },
  { value: "70+" },
];

function areaBucketToRange(b: AreaBucket): { min: number; max: number } {
  switch (b) {
    case "20-40":
      return { min: 20, max: 40 };
    case "40-70":
      return { min: 40, max: 70 };
    case "70+":
      return { min: 70, max: 500 };
    default:
      return { min: 0, max: 500 };
  }
}

const CONSTRUCTION_OPTIONS: Array<{ value: string | null; labelKey: string }> =
  [
    { value: null, labelKey: "allOption" },
    { value: "completed", labelKey: "constructionCompleted" },
    { value: "under_construction", labelKey: "underConstruction" },
  ];

const RENOVATION_OPTIONS: Array<{ value: string | null; labelKey: string }> = [
  { value: null, labelKey: "anyOption" },
  { value: "black_frame", labelKey: "renovationBlackFrame" },
  { value: "white_frame", labelKey: "renovationWhiteFrame" },
  { value: "furnished", labelKey: "renovationFurnished" },
];

const PRICE_MIN = 0;
const PRICE_MAX = 1_000_000;
const PRICE_STEP = 5_000;
const DEFAULT_PRICE_MIN = 30_000;
const DEFAULT_PRICE_MAX = 500_000;

const AREA_MIN = 0;
const AREA_MAX_SLIDER = 500;
const AREA_STEP = 5;
const DEFAULT_AREA_MIN = 0;
const DEFAULT_AREA_MAX = 500;

function formatUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

// Format ₾ amounts with thousands separators (Georgian convention uses space).
function formatGel(n: number): string {
  return formatPrice(n);
}

// ─── Component ─────────────────────────────────────────────────────────

export function SaleSearchBox({
  onSearch,
  className,
  isPending = false,
  showInvestmentFilters = true,
  showMap: showMapProp,
  onShowMapChange,
  zones,
}: SaleSearchBoxProps) {
  const t = useTranslations("SaleSearchBox");
  const tZones = useTranslations("Zones");
  // Tabs
  const [tab, setTab] = useState<SaleTab>("search");

  // Existing filter state
  const [propertyType, setPropertyType] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [rooms, setRooms] = useState<number[]>([]);
  const [areaMin, setAreaMin] = useState(DEFAULT_AREA_MIN);
  const [areaMax, setAreaMax] = useState(DEFAULT_AREA_MAX);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [payment, setPayment] = useState<string[]>([]);
  const [developers, setDevelopers] = useState<string[]>([]);
  const [sellerTypes, setSellerTypes] = useState<string[]>([]);
  const [internalShowMap, setInternalShowMap] = useState(false);
  const showMap = showMapProp ?? internalShowMap;
  const handleMapToggle = useCallback(() => {
    const next = !showMap;
    if (onShowMapChange) onShowMapChange(next);
    if (showMapProp === undefined) setInternalShowMap(next);
  }, [showMap, showMapProp, onShowMapChange]);

  // Investment quick filters
  const [roiMin, setRoiMin] = useState<number | null>(null);
  const [areaBucket, setAreaBucket] = useState<AreaBucket>(null);
  const [constructionStatus, setConstructionStatus] = useState<string | null>(
    null,
  );
  const [renovationStatus, setRenovationStatus] = useState<string | null>(null);

  // Appraisal tab state
  const [appraisalZone, setAppraisalZone] = useState("");
  const [appraisalArea, setAppraisalArea] = useState("");
  const [appraisalResult, setAppraisalResult] = useState<{
    avgPrice: number;
    avgPricePerSqm: number;
    count: number;
    estimatedValue: number | null;
    zone: string;
  } | null>(null);
  const [appraisalLoading, setAppraisalLoading] = useState(false);
  const [appraisalError, setAppraisalError] = useState<string | null>(null);

  // Clear result when inputs change so a stale estimate doesn't linger.
  useEffect(() => {
    setAppraisalResult(null);
    setAppraisalError(null);
  }, [appraisalZone, appraisalArea]);

  const [activeDropdown, setActiveDropdown] =
    useState<SaleActiveDropdown>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileFilterDraft, setMobileFilterDraft] =
    useState<MobileFilterDraft | null>(null);

  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!activeDropdown || isMobile) return;
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeDropdown, isMobile]);

  const toggleDropdown = useCallback((name: SaleActiveDropdown) => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  }, []);

  const togglePropertyType = useCallback((value: string) => {
    setPropertyTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const toggleRoomQuick = useCallback((value: number) => {
    setRooms((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setPropertyTypes([]);
    setPriceMin("");
    setPriceMax("");
    setCadastralCode("");
    setStatuses([]);
    setRooms([]);
    setAreaMin(DEFAULT_AREA_MIN);
    setAreaMax(DEFAULT_AREA_MAX);
    setAmenities([]);
    setPayment([]);
    setDevelopers([]);
    setSellerTypes([]);
  }, []);

  const openMobileFilters = useCallback(() => {
    setMobileFilterDraft({
      propertyTypes: [...propertyTypes],
      priceMin,
      priceMax,
      cadastralCode,
      statuses: [...statuses],
      rooms: [...rooms],
      areaMin,
      areaMax,
      amenities: [...amenities],
      payment: [...payment],
      developers: [...developers],
      sellerTypes: [...sellerTypes],
      roiMin,
      areaBucket,
      constructionStatus,
      renovationStatus,
    });
    setActiveDropdown("filters");
  }, [
    propertyTypes,
    priceMin,
    priceMax,
    cadastralCode,
    statuses,
    rooms,
    areaMin,
    areaMax,
    amenities,
    payment,
    developers,
    sellerTypes,
    roiMin,
    areaBucket,
    constructionStatus,
    renovationStatus,
  ]);

  const resetMobileFilters = useCallback(() => {
    setMobileFilterDraft({
      propertyTypes: [],
      priceMin: "",
      priceMax: "",
      cadastralCode: "",
      statuses: [],
      rooms: [],
      areaMin: DEFAULT_AREA_MIN,
      areaMax: DEFAULT_AREA_MAX,
      amenities: [],
      payment: [],
      developers: [],
      sellerTypes: [],
      roiMin: null,
      areaBucket: null,
      constructionStatus: null,
      renovationStatus: null,
    });
  }, []);

  const applyMobileFilters = useCallback(() => {
    if (!mobileFilterDraft) return;
    setPropertyTypes(mobileFilterDraft.propertyTypes);
    setPriceMin(mobileFilterDraft.priceMin);
    setPriceMax(mobileFilterDraft.priceMax);
    setCadastralCode(mobileFilterDraft.cadastralCode);
    setStatuses(mobileFilterDraft.statuses);
    setRooms(mobileFilterDraft.rooms);
    setAreaMin(mobileFilterDraft.areaMin);
    setAreaMax(mobileFilterDraft.areaMax);
    setAmenities(mobileFilterDraft.amenities);
    setPayment(mobileFilterDraft.payment);
    setDevelopers(mobileFilterDraft.developers);
    setSellerTypes(mobileFilterDraft.sellerTypes);
    setRoiMin(mobileFilterDraft.roiMin);
    setAreaBucket(mobileFilterDraft.areaBucket);
    setConstructionStatus(mobileFilterDraft.constructionStatus);
    setRenovationStatus(mobileFilterDraft.renovationStatus);
    setActiveDropdown(null);
  }, [mobileFilterDraft]);

  const priceMinNum = priceMin ? Number(priceMin) || DEFAULT_PRICE_MIN : 0;
  const priceMaxNum = priceMax
    ? Number(priceMax) || DEFAULT_PRICE_MAX
    : PRICE_MAX;
  const mobileDraftPriceMin = mobileFilterDraft?.priceMin
    ? Number(mobileFilterDraft.priceMin) || DEFAULT_PRICE_MIN
    : 0;
  const mobileDraftPriceMax = mobileFilterDraft?.priceMax
    ? Number(mobileFilterDraft.priceMax) || DEFAULT_PRICE_MAX
    : PRICE_MAX;

  const runAppraisal = useCallback(
    async (zone: string, areaInput: string) => {
      setAppraisalLoading(true);
      setAppraisalError(null);
      setAppraisalResult(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("properties")
          .select("sale_price, area_sqm, location_lat, location_lng")
          .eq("status", "active")
          .eq("is_for_sale", true)
          .not("sale_price", "is", null);

        if (error) {
          setAppraisalError(t("appraisalLoadError"));
          return;
        }

        const rows = (data ?? []).filter(
          (
            r,
          ): r is {
            sale_price: number;
            area_sqm: number | null;
            location_lat: number;
            location_lng: number;
          } =>
            r.sale_price != null &&
            r.location_lat != null &&
            r.location_lng != null,
        );

        const inZone = rows.filter(
          (r) =>
            nearestZoneNameFrom(zones, r.location_lat, r.location_lng) === zone,
        );

        if (inZone.length === 0) {
          setAppraisalResult({
            avgPrice: 0,
            avgPricePerSqm: 0,
            count: 0,
            estimatedValue: null,
            zone,
          });
          return;
        }

        const avgPrice =
          inZone.reduce((sum, r) => sum + Number(r.sale_price), 0) /
          inZone.length;

        const withArea = inZone.filter(
          (r) => r.area_sqm != null && Number(r.area_sqm) > 0,
        );
        const avgPricePerSqm = withArea.length
          ? withArea.reduce(
              (sum, r) => sum + Number(r.sale_price) / Number(r.area_sqm),
              0,
            ) / withArea.length
          : 0;

        const areaNum = Number(areaInput);
        const estimatedValue =
          avgPricePerSqm > 0 && Number.isFinite(areaNum) && areaNum > 0
            ? avgPricePerSqm * areaNum
            : null;

        setAppraisalResult({
          avgPrice,
          avgPricePerSqm,
          count: inZone.length,
          estimatedValue,
          zone,
        });
      } finally {
        setAppraisalLoading(false);
      }
    },
    [zones, t],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "appraise") {
      if (!appraisalZone) return;
      void runAppraisal(appraisalZone, appraisalArea);
      return;
    }

    // Translate the bucket into explicit min/max that the backend understands.
    const bucketRange = areaBucketToRange(areaBucket);
    const resolvedAreaMin = areaBucket ? bucketRange.min : areaMin;
    const resolvedAreaMax = areaBucket ? bucketRange.max : areaMax;

    onSearch({
      location: "",
      propertyType,
      propertyTypes,
      priceMin: priceMinNum,
      priceMax: priceMaxNum,
      cadastralCode,
      statuses,
      rooms,
      areaMin: resolvedAreaMin,
      areaMax: resolvedAreaMax,
      amenities,
      payment,
      developers,
      sellerTypes,
      roiMin,
      constructionStatus,
      renovationStatus,
    });
  };

  const selectedType = PROPERTY_TYPES.find((o) => o.value === propertyType);
  const propertyTypeLabel = selectedType
    ? t(selectedType.labelKey)
    : t("anyOption");
  const roomsLabel =
    rooms.length === 0
      ? t("allOption")
      : rooms
          .slice()
          .sort((a, b) => a - b)
          .map((n) => (n === 4 ? "4+" : String(n)))
          .join(", ");

  const roiOptionLabel = (value: number | null) =>
    value == null ? t("roiAny") : t("roiFrom", { value });
  const areaOptionLabel = (value: AreaBucket) =>
    value == null ? t("anyOption") : t("areaRange", { range: value });

  const roiLabel = roiOptionLabel(roiMin);
  const areaLabel = areaOptionLabel(areaBucket);
  const constructionLabel = t(
    CONSTRUCTION_OPTIONS.find((o) => o.value === constructionStatus)
      ?.labelKey ?? "allOption",
  );
  const renovationLabel = t(
    RENOVATION_OPTIONS.find((o) => o.value === renovationStatus)?.labelKey ??
      "anyOption",
  );

  const activeFilterCount =
    propertyTypes.length +
    (priceMin || priceMax ? 1 : 0) +
    (cadastralCode ? 1 : 0) +
    statuses.length +
    rooms.length +
    (areaMin !== DEFAULT_AREA_MIN || areaMax !== DEFAULT_AREA_MAX ? 1 : 0) +
    amenities.length +
    payment.length +
    developers.length +
    sellerTypes.length +
    (roiMin !== null ? 1 : 0) +
    (areaBucket !== null ? 1 : 0) +
    (constructionStatus !== null ? 1 : 0) +
    (renovationStatus !== null ? 1 : 0);

  const appraisalZoneLabel = appraisalZone
    ? zoneDisplayName(zones, tZones, appraisalZone)
    : t("selectZone");

  return (
    <form
      onSubmit={handleSubmit}
      ref={containerRef}
      className={cn(
        "relative rounded-[24px] bg-white p-4 text-left shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.2)]",
        "md:p-5",
        className,
      )}
    >
      {/* ═══ Tab row ═══ */}
      <div className="mb-4 flex items-center gap-6 border-b border-[#F1F5F9] px-2">
        <TabButton
          active={tab === "search"}
          onClick={() => {
            setTab("search");
            setActiveDropdown(null);
          }}
        >
          {t("tabBuySearch")}
        </TabButton>
        <TabButton
          active={tab === "appraise"}
          onClick={() => {
            setTab("appraise");
            setActiveDropdown(null);
          }}
        >
          {t("tabSellAppraise")}
        </TabButton>
      </div>

      {tab === "search" ? (
        <>
          {/* ═══ Mobile: stacked ═══ */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            <MobileField
              label={t("fieldType")}
              value={propertyTypeLabel}
              onClick={() => toggleDropdown("type")}
              open={activeDropdown === "type"}
            >
              <TypeList
                value={propertyType}
                onSelect={(v) => {
                  setPropertyType(v);
                  setActiveDropdown(null);
                }}
              />
            </MobileField>

            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                {t("fieldPrice")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("minPlaceholder")}
                  value={priceMin}
                  onChange={(e) =>
                    setPriceMin(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#94A3B8]"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("maxPlaceholder")}
                  value={priceMax}
                  onChange={(e) =>
                    setPriceMax(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none placeholder:text-[#94A3B8]"
                />
              </div>
            </div>

            <MobileField
              label={t("fieldRooms")}
              value={roomsLabel}
              onClick={() => toggleDropdown("rooms")}
              open={activeDropdown === "rooms"}
            >
              <div className="flex flex-wrap gap-2 p-2">
                {ROOM_OPTIONS.map((n) => {
                  const checked = rooms.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleRoomQuick(n)}
                      className={cn(
                        "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                        checked
                          ? "border-[#16A34A] bg-[#16A34A] text-white"
                          : "border-[#E2E8F0] bg-white text-[#1E293B]",
                      )}
                    >
                      {n === 4 ? "4+" : String(n)}
                    </button>
                  );
                })}
              </div>
            </MobileField>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={openMobileFilters}
                data-testid="sale-mobile-filters"
                className={cn(
                  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-bold text-[#1E293B] transition-colors",
                  activeDropdown === "filters" &&
                    "border-[#16A34A] text-[#16A34A]",
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                {t("detailed")}
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#16A34A] text-[10px] font-black text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleMapToggle}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-lg border px-4 text-[13px] font-bold transition-colors",
                  showMap
                    ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                    : "border-[#E2E8F0] bg-white text-[#1E293B]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    showMap ? "bg-[#16A34A]" : "bg-[#CBD5E1]",
                  )}
                />
                <MapIcon className="size-3.5" />
                {t("map")}
              </button>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="h-11 gap-2 bg-[#0A1F2E] px-6 text-white hover:bg-[#0F2A40] disabled:opacity-70"
            >
              <Search className="size-4" />
              {t("searchMobile")}
            </Button>
          </div>

          {/* ═══ Desktop: horizontal pill ═══ */}
          <div className="hidden items-center gap-1 lg:flex">
            <DesktopField
              label={t("fieldType")}
              value={propertyTypeLabel}
              icon={<Home className="size-4 text-[#94A3B8]" />}
              active={activeDropdown === "type"}
              onClick={() => toggleDropdown("type")}
            />

            <div className="h-10 w-px bg-[#F1F5F9]" />

            <div className="flex h-[68px] flex-1 flex-col justify-center px-5">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[1px]",
                  priceMin || priceMax ? "text-[#16A34A]" : "text-[#94A3B8]",
                )}
              >
                {t("priceRangeLabel")}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("minPlaceholder")}
                  value={priceMin}
                  onChange={(e) =>
                    setPriceMin(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-8 w-full min-w-0 rounded-md border border-[#E2E8F0] bg-white px-2 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
                />
                <span className="text-[13px] font-bold text-[#CBD5E1]">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={t("maxPlaceholder")}
                  value={priceMax}
                  onChange={(e) =>
                    setPriceMax(e.target.value.replace(/\D/g, ""))
                  }
                  className="h-8 w-full min-w-0 rounded-md border border-[#E2E8F0] bg-white px-2 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
                />
              </div>
            </div>

            <div className="h-10 w-px bg-[#F1F5F9]" />

            <DesktopField
              label={t("fieldRooms")}
              value={roomsLabel}
              icon={<BedDouble className="size-4 text-[#94A3B8]" />}
              active={activeDropdown === "rooms"}
              onClick={() => toggleDropdown("rooms")}
            />

            <button
              type="button"
              onClick={() => toggleDropdown("filters")}
              className={cn(
                "ml-2 flex h-[48px] shrink-0 items-center gap-2 rounded-full border px-5 text-[13px] font-bold transition-colors",
                activeDropdown === "filters"
                  ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                  : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
              )}
            >
              <SlidersHorizontal className="size-4" />
              {t("detailed")}
              {activeFilterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-[#16A34A] text-[10px] font-black text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleMapToggle}
              className={cn(
                "flex h-[48px] shrink-0 items-center gap-2 rounded-full border px-5 text-[13px] font-bold transition-colors",
                showMap
                  ? "border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]"
                  : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
              )}
              aria-pressed={showMap}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  showMap ? "bg-[#16A34A]" : "bg-[#CBD5E1]",
                )}
              />
              <MapIcon className="size-4" />
              {t("onMap")}
            </button>

            <Button
              type="submit"
              disabled={isPending}
              className="ml-2 h-[52px] shrink-0 gap-2 rounded-full bg-[#0A1F2E] px-7 text-[14px] font-bold text-white hover:bg-[#0F2A40] disabled:opacity-70"
              aria-label={t("search")}
            >
              {isPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Search className="size-4" />
                  {t("search")}
                </>
              )}
            </Button>
          </div>

          {/* ═══ Investment quick-filter row (ROI / Area / Status / Renovation) ═══ */}
          {showInvestmentFilters && (
            <div className="mt-4 hidden grid-cols-4 gap-4 lg:grid">
              <QuickSelect
                label={t("quickRoi")}
                value={roiLabel}
                active={activeDropdown === "roi"}
                onToggle={() => toggleDropdown("roi")}
              >
                <OptionList
                  options={ROI_OPTIONS.map((o) => ({
                    key: o.value == null ? "null" : String(o.value),
                    label: roiOptionLabel(o.value),
                    selected: o.value === roiMin,
                    onSelect: () => {
                      setRoiMin(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label={t("quickArea")}
                value={areaLabel}
                active={activeDropdown === "area"}
                onToggle={() => toggleDropdown("area")}
              >
                <OptionList
                  options={AREA_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: areaOptionLabel(o.value),
                    selected: o.value === areaBucket,
                    onSelect: () => {
                      setAreaBucket(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label={t("quickStatus")}
                value={constructionLabel}
                active={activeDropdown === "status"}
                onToggle={() => toggleDropdown("status")}
              >
                <OptionList
                  options={CONSTRUCTION_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: t(o.labelKey),
                    selected: o.value === constructionStatus,
                    onSelect: () => {
                      setConstructionStatus(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>

              <QuickSelect
                label={t("quickRenovation")}
                value={renovationLabel}
                active={activeDropdown === "renovation"}
                onToggle={() => toggleDropdown("renovation")}
              >
                <OptionList
                  options={RENOVATION_OPTIONS.map((o) => ({
                    key: o.value ?? "any",
                    label: t(o.labelKey),
                    selected: o.value === renovationStatus,
                    onSelect: () => {
                      setRenovationStatus(o.value);
                      setActiveDropdown(null);
                    },
                  }))}
                />
              </QuickSelect>
            </div>
          )}
        </>
      ) : (
        <>
          <AppraisalPane
            zone={appraisalZone}
            zoneLabel={appraisalZoneLabel}
            area={appraisalArea}
            onChangeArea={setAppraisalArea}
            zoneOpen={activeDropdown === "zone"}
            onToggleZone={() => toggleDropdown("zone")}
            onSelectZone={(v) => {
              setAppraisalZone(v);
              setActiveDropdown(null);
            }}
            isPending={isPending || appraisalLoading}
            disabled={!appraisalZone}
            zones={zones}
          />
          {(appraisalLoading || appraisalResult || appraisalError) && (
            <AppraisalResults
              result={appraisalResult}
              loading={appraisalLoading}
              error={appraisalError}
              zones={zones}
            />
          )}
        </>
      )}

      {/* ═══ Pill-level popovers (type / rooms) — search tab only ═══ */}
      {tab === "search" && activeDropdown === "type" && (
        <div className="absolute left-4 top-full z-50 mt-2 hidden w-[300px] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] lg:block">
          <TypeList
            value={propertyType}
            onSelect={(v) => {
              setPropertyType(v);
              setActiveDropdown(null);
            }}
          />
        </div>
      )}

      {tab === "search" && activeDropdown === "rooms" && (
        <div className="absolute right-[260px] top-full z-50 mt-2 hidden w-[240px] rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] lg:block">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
            {t("roomsCountTitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            {ROOM_OPTIONS.map((n) => {
              const checked = rooms.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleRoomQuick(n)}
                  className={cn(
                    "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#16A34A] bg-[#16A34A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {n === 4 ? "4+" : String(n)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === "search" && isMobile && (
        <BottomSheet
          isOpen={activeDropdown === "filters"}
          onClose={() => setActiveDropdown(null)}
          title={t("detailed")}
        >
          {mobileFilterDraft && (
            <FiltersPanel
              mobile
              propertyTypes={mobileFilterDraft.propertyTypes}
              onToggleType={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        propertyTypes: draft.propertyTypes.includes(v)
                          ? draft.propertyTypes.filter((item) => item !== v)
                          : [...draft.propertyTypes, v],
                      },
                )
              }
              priceMin={mobileDraftPriceMin}
              priceMax={mobileDraftPriceMax}
              onChangeMin={(v) =>
                setMobileFilterDraft(
                  (draft) => draft && { ...draft, priceMin: String(v) },
                )
              }
              onChangeMax={(v) =>
                setMobileFilterDraft(
                  (draft) => draft && { ...draft, priceMax: String(v) },
                )
              }
              cadastralCode={mobileFilterDraft.cadastralCode}
              onChangeCadastral={(v) =>
                setMobileFilterDraft(
                  (draft) => draft && { ...draft, cadastralCode: v },
                )
              }
              statuses={mobileFilterDraft.statuses}
              onToggleStatus={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        statuses: draft.statuses.includes(v)
                          ? draft.statuses.filter((item) => item !== v)
                          : [...draft.statuses, v],
                      },
                )
              }
              rooms={mobileFilterDraft.rooms}
              onToggleRoom={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        rooms: draft.rooms.includes(v)
                          ? draft.rooms.filter((item) => item !== v)
                          : [...draft.rooms, v],
                      },
                )
              }
              areaMin={mobileFilterDraft.areaMin}
              areaMax={mobileFilterDraft.areaMax}
              onChangeAreaMin={(v) =>
                setMobileFilterDraft(
                  (draft) => draft && { ...draft, areaMin: v },
                )
              }
              onChangeAreaMax={(v) =>
                setMobileFilterDraft(
                  (draft) => draft && { ...draft, areaMax: v },
                )
              }
              amenities={mobileFilterDraft.amenities}
              onToggleAmenity={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        amenities: draft.amenities.includes(v)
                          ? draft.amenities.filter((item) => item !== v)
                          : [...draft.amenities, v],
                      },
                )
              }
              payment={mobileFilterDraft.payment}
              onTogglePayment={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        payment: draft.payment.includes(v)
                          ? draft.payment.filter((item) => item !== v)
                          : [...draft.payment, v],
                      },
                )
              }
              developers={mobileFilterDraft.developers}
              onToggleDeveloper={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        developers: draft.developers.includes(v)
                          ? draft.developers.filter((item) => item !== v)
                          : [...draft.developers, v],
                      },
                )
              }
              sellerTypes={mobileFilterDraft.sellerTypes}
              onToggleSellerType={(v) =>
                setMobileFilterDraft((draft) =>
                  !draft
                    ? draft
                    : {
                        ...draft,
                        sellerTypes: draft.sellerTypes.includes(v)
                          ? draft.sellerTypes.filter((item) => item !== v)
                          : [...draft.sellerTypes, v],
                      },
                )
              }
              investment={{
                roiMin: mobileFilterDraft.roiMin,
                areaBucket: mobileFilterDraft.areaBucket,
                constructionStatus: mobileFilterDraft.constructionStatus,
                renovationStatus: mobileFilterDraft.renovationStatus,
                onRoiChange: (roiMin) =>
                  setMobileFilterDraft(
                    (draft) => draft && { ...draft, roiMin },
                  ),
                onAreaChange: (areaBucket) =>
                  setMobileFilterDraft(
                    (draft) => draft && { ...draft, areaBucket },
                  ),
                onConstructionChange: (constructionStatus) =>
                  setMobileFilterDraft(
                    (draft) => draft && { ...draft, constructionStatus },
                  ),
                onRenovationChange: (renovationStatus) =>
                  setMobileFilterDraft(
                    (draft) => draft && { ...draft, renovationStatus },
                  ),
              }}
              onReset={resetMobileFilters}
              onApply={applyMobileFilters}
            />
          )}
        </BottomSheet>
      )}

      {tab === "search" && !isMobile && activeDropdown === "filters" && (
        <div className="absolute left-0 right-0 top-full z-50 mt-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-left shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
          <FiltersPanel
            propertyTypes={propertyTypes}
            onToggleType={togglePropertyType}
            priceMin={priceMinNum}
            priceMax={priceMaxNum}
            onChangeMin={(v) => setPriceMin(String(v))}
            onChangeMax={(v) => setPriceMax(String(v))}
            cadastralCode={cadastralCode}
            onChangeCadastral={setCadastralCode}
            statuses={statuses}
            onToggleStatus={(v) =>
              setStatuses((prev) =>
                prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v],
              )
            }
            rooms={rooms}
            onToggleRoom={toggleRoomQuick}
            areaMin={areaMin}
            areaMax={areaMax}
            onChangeAreaMin={setAreaMin}
            onChangeAreaMax={setAreaMax}
            amenities={amenities}
            onToggleAmenity={(v) =>
              setAmenities((prev) =>
                prev.includes(v) ? prev.filter((a) => a !== v) : [...prev, v],
              )
            }
            payment={payment}
            onTogglePayment={(v) =>
              setPayment((prev) =>
                prev.includes(v) ? prev.filter((p) => p !== v) : [...prev, v],
              )
            }
            developers={developers}
            onToggleDeveloper={(v) =>
              setDevelopers((prev) =>
                prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v],
              )
            }
            sellerTypes={sellerTypes}
            onToggleSellerType={(v) =>
              setSellerTypes((prev) =>
                prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v],
              )
            }
            onReset={resetFilters}
            onApply={() => setActiveDropdown(null)}
          />
        </div>
      )}
    </form>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex h-10 items-center border-b-2 text-[14px] font-bold transition-colors",
        active
          ? "border-[#0F172A] text-[#0F172A]"
          : "border-transparent text-[#94A3B8] hover:text-[#1E293B]",
      )}
    >
      {children}
    </button>
  );
}

function DesktopField({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative flex h-[68px] flex-1 flex-col justify-center px-5">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[1px]",
          active ? "text-[#16A34A]" : "text-[#94A3B8]",
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mt-0.5 flex w-full items-center gap-1.5 text-left text-[14px] font-bold leading-[20px] outline-none",
          active ? "text-[#16A34A]" : "text-[#1E293B]",
        )}
      >
        {icon}
        <span className="truncate">{value}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0",
            active ? "text-[#16A34A]" : "text-[#94A3B8]",
          )}
        />
      </button>
    </div>
  );
}

function MobileField({
  label,
  value,
  onClick,
  open,
  children,
}: {
  label: string;
  value: string;
  onClick: () => void;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
        {label}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 text-left text-sm text-[#1E293B] outline-none"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="size-4 text-[#94A3B8]" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
          {children}
        </div>
      )}
    </div>
  );
}

function QuickSelect({
  label,
  value,
  active,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
        {label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-[13px] font-bold transition-colors",
          active
            ? "border-[#16A34A] text-[#16A34A]"
            : "border-[#E2E8F0] text-[#1E293B] hover:border-[#CBD5E1]",
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0",
            active ? "text-[#16A34A]" : "text-[#94A3B8]",
          )}
        />
      </button>
      {active && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]">
          {children}
        </div>
      )}
    </div>
  );
}

function OptionList({
  options,
}: {
  options: Array<{
    key: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <ul className="flex flex-col">
      {options.map((o, idx) => (
        <li key={o.key}>
          <button
            type="button"
            onClick={o.onSelect}
            className={cn(
              "flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-bold transition-colors",
              idx === 0
                ? "bg-[#1E419A] text-white hover:bg-[#1E3A8A]"
                : "text-[#1E293B] hover:bg-[#F8FAFC]",
              o.selected && idx !== 0 && "bg-[#EFF6FF] text-[#1E419A]",
            )}
          >
            <span className="truncate">{o.label}</span>
            {o.selected && idx !== 0 && (
              <Check className="size-4 text-[#1E419A]" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TypeList({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (v: string) => void;
}) {
  const t = useTranslations("SaleSearchBox");
  return (
    <ul className="flex flex-col">
      <li>
        <button
          type="button"
          onClick={() => onSelect("")}
          className={cn(
            "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#1E293B] hover:bg-[#F8FAFC]",
            !value && "bg-[#F0FDF4] text-[#16A34A]",
          )}
        >
          {t("anyOption")}
          {!value && <Check className="size-4" />}
        </button>
      </li>
      {PROPERTY_TYPES.map((option) => (
        <li key={option.value}>
          <button
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-bold text-[#1E293B] hover:bg-[#F8FAFC]",
              value === option.value && "bg-[#F0FDF4] text-[#16A34A]",
            )}
          >
            {t(option.labelKey)}
            {value === option.value && <Check className="size-4" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Appraisal pane ────────────────────────────────────────────────────

function AppraisalPane({
  zone,
  zoneLabel,
  area,
  onChangeArea,
  zoneOpen,
  onToggleZone,
  onSelectZone,
  isPending,
  disabled,
  zones,
}: {
  zone: string;
  zoneLabel: string;
  area: string;
  onChangeArea: (v: string) => void;
  zoneOpen: boolean;
  onToggleZone: () => void;
  onSelectZone: (v: string) => void;
  isPending: boolean;
  disabled: boolean;
  zones: Zone[];
}) {
  const t = useTranslations("SaleSearchBox");
  const tZones = useTranslations("Zones");
  return (
    <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
      <div className="max-w-[520px]">
        <h3 className="text-[20px] font-black leading-[26px] text-[#0F172A] md:text-[22px]">
          {t("appraiseTitle")}
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {t("appraiseSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_auto]">
        <div className="relative">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            {t("locationZone")}
          </label>
          <button
            type="button"
            onClick={onToggleZone}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-[13px] font-bold transition-colors",
              zoneOpen
                ? "border-[#16A34A] text-[#16A34A]"
                : "border-[#E2E8F0] text-[#1E293B] hover:border-[#CBD5E1]",
            )}
          >
            <span className="truncate">{zoneLabel}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0",
                zoneOpen ? "text-[#16A34A]" : "text-[#94A3B8]",
              )}
            />
          </button>
          {zoneOpen && (
            <ul className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-[0px_20px_40px_-10px_rgba(0,0,0,0.15)]">
              {zones.map((z) => {
                const selected = z.name_ka === zone;
                return (
                  <li key={z.id}>
                    <button
                      type="button"
                      onClick={() => onSelectZone(z.name_ka)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-bold transition-colors hover:bg-[#F8FAFC]",
                        selected && "bg-[#F0FDF4] text-[#16A34A]",
                      )}
                    >
                      {TRANSLATED_ZONE_SLUGS.has(z.slug)
                        ? tZones(`${z.slug}.name`)
                        : z.name_ka}
                      {selected && <Check className="size-4" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
            {t("quickArea")}
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder={t("areaPlaceholder")}
            value={area}
            onChange={(e) => onChangeArea(e.target.value.replace(/\D/g, ""))}
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[13px] font-bold text-[#1E293B] outline-none placeholder:font-medium placeholder:text-[#94A3B8] focus:border-[#16A34A]"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending || disabled}
          className="h-11 shrink-0 rounded-lg bg-[#F97316] px-6 text-[13px] font-black text-white hover:bg-[#EA580C] disabled:opacity-70"
        >
          {t("appraise")}
        </Button>
      </div>
    </div>
  );
}

// ─── Appraisal results panel ──────────────────────────────────────────

function AppraisalResults({
  result,
  loading,
  error,
  zones,
}: {
  result: {
    avgPrice: number;
    avgPricePerSqm: number;
    count: number;
    estimatedValue: number | null;
    zone: string;
  } | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
}) {
  const t = useTranslations("SaleSearchBox");
  const tZones = useTranslations("Zones");
  return (
    <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 md:p-5">
      {loading && (
        <p className="text-[13px] font-bold text-[#64748B]">{t("loading")}</p>
      )}

      {!loading && error && (
        <p className="text-[13px] font-bold text-[#DC2626]">{error}</p>
      )}

      {!loading && !error && result && result.count === 0 && (
        <p className="text-[13px] font-bold text-[#64748B]">
          {t("noZoneData")}
        </p>
      )}

      {!loading && !error && result && result.count > 0 && (
        <>
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.55px] text-[#94A3B8]">
            {t("zoneLabel", {
              zone: zoneDisplayName(zones, tZones, result.zone),
            })}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label={t("avgPrice")} value={formatGel(result.avgPrice)} />
            <Stat
              label={t("avgPricePerSqm")}
              value={t("perSqmValue", {
                price: formatGel(result.avgPricePerSqm),
              })}
            />
            {result.estimatedValue != null && (
              <Stat
                label={t("estimatedValue")}
                value={formatGel(result.estimatedValue)}
              />
            )}
          </div>
          <p className="mt-3 text-[11px] font-medium text-[#94A3B8]">
            {t("basedOnListings", { count: result.count })}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-black leading-tight text-[#16A34A]">
        {value}
      </p>
    </div>
  );
}

// ─── Advanced filters panel + range sliders ───────────────────────────

function PriceRangePanel({
  priceMin,
  priceMax,
  onChangeMin,
  onChangeMax,
}: {
  priceMin: number;
  priceMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  const t = useTranslations("SaleSearchBox");
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#F1F5F9]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#16A34A]"
          style={{
            left: `${(priceMin / PRICE_MAX) * 100}%`,
            right: `${100 - (priceMax / PRICE_MAX) * 100}%`,
          }}
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
          value={priceMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < priceMax) onChangeMin(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#16A34A] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
          value={priceMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > priceMin) onChangeMax(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#16A34A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#16A34A] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">
            {t("minLabel")}
          </span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {formatUsd(priceMin)}
          </span>
        </div>
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">
            {t("maxLabel")}
          </span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {formatUsd(priceMax)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FiltersPanel({
  propertyTypes,
  onToggleType,
  priceMin,
  priceMax,
  onChangeMin,
  onChangeMax,
  cadastralCode,
  onChangeCadastral,
  statuses,
  onToggleStatus,
  rooms,
  onToggleRoom,
  areaMin,
  areaMax,
  onChangeAreaMin,
  onChangeAreaMax,
  amenities,
  onToggleAmenity,
  payment,
  onTogglePayment,
  developers,
  onToggleDeveloper,
  sellerTypes,
  onToggleSellerType,
  investment,
  onReset,
  onApply,
  mobile = false,
}: {
  propertyTypes: string[];
  onToggleType: (value: string) => void;
  priceMin: number;
  priceMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  cadastralCode: string;
  onChangeCadastral: (v: string) => void;
  statuses: string[];
  onToggleStatus: (v: string) => void;
  rooms: number[];
  onToggleRoom: (v: number) => void;
  areaMin: number;
  areaMax: number;
  onChangeAreaMin: (v: number) => void;
  onChangeAreaMax: (v: number) => void;
  amenities: string[];
  onToggleAmenity: (v: string) => void;
  payment: string[];
  onTogglePayment: (v: string) => void;
  developers: string[];
  onToggleDeveloper: (v: string) => void;
  sellerTypes: string[];
  onToggleSellerType: (v: string) => void;
  investment?: {
    roiMin: number | null;
    areaBucket: AreaBucket;
    constructionStatus: string | null;
    renovationStatus: string | null;
    onRoiChange: (value: number | null) => void;
    onAreaChange: (value: AreaBucket) => void;
    onConstructionChange: (value: string | null) => void;
    onRenovationChange: (value: string | null) => void;
  };
  onReset: () => void;
  onApply: () => void;
  mobile?: boolean;
}) {
  const t = useTranslations("SaleSearchBox");
  return (
    <div className="text-left">
      {investment && (
        <div className="mb-6 grid grid-cols-1 gap-5 border-b border-[#F1F5F9] pb-6">
          <FilterCell label={t("quickRoi")}>
            <div className="flex flex-wrap gap-2">
              {ROI_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value ?? "any"}
                  selected={investment.roiMin === option.value}
                  onClick={() => investment.onRoiChange(option.value)}
                >
                  {option.value == null
                    ? t("roiAny")
                    : t("roiFrom", { value: option.value })}
                </FilterChip>
              ))}
            </div>
          </FilterCell>
          <FilterCell label={t("quickArea")}>
            <div className="flex flex-wrap gap-2">
              {AREA_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value ?? "any"}
                  selected={investment.areaBucket === option.value}
                  onClick={() => investment.onAreaChange(option.value)}
                >
                  {option.value == null
                    ? t("anyOption")
                    : t("areaRange", { range: option.value })}
                </FilterChip>
              ))}
            </div>
          </FilterCell>
          <FilterCell label={t("quickStatus")}>
            <div className="flex flex-wrap gap-2">
              {CONSTRUCTION_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value ?? "any"}
                  selected={investment.constructionStatus === option.value}
                  onClick={() => investment.onConstructionChange(option.value)}
                >
                  {t(option.labelKey)}
                </FilterChip>
              ))}
            </div>
          </FilterCell>
          <FilterCell label={t("quickRenovation")}>
            <div className="flex flex-wrap gap-2">
              {RENOVATION_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value ?? "any"}
                  selected={investment.renovationStatus === option.value}
                  onClick={() => investment.onRenovationChange(option.value)}
                >
                  {t(option.labelKey)}
                </FilterChip>
              ))}
            </div>
          </FilterCell>
        </div>
      )}
      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
        {t("seller")}
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {SELLER_TYPE_OPTIONS.map((s) => {
          const checked = sellerTypes.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onToggleSellerType(s.value)}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-bold transition-colors",
                checked
                  ? "bg-[#1E419A] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#1E419A] hover:text-[#1E419A]",
              )}
            >
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
        {t("quickStatus")}
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => {
          const checked = statuses.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onToggleStatus(s.value)}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-bold transition-colors",
                checked
                  ? "bg-[#1E419A] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#1E419A] hover:text-[#1E419A]",
              )}
            >
              {t(s.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <FilterCell label={t("apartmentType")}>
          <div className="flex flex-col gap-1.5">
            {PROPERTY_TYPES.map((option) => {
              const checked = propertyTypes.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onToggleType(option.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      checked
                        ? "border-white/40 bg-white text-[#1E419A]"
                        : "border-[#CBD5E1] bg-white",
                    )}
                  >
                    {checked && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t(option.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label={t("payment")}>
          <div className="flex flex-col gap-1.5">
            {PAYMENT_OPTIONS.map((p) => {
              const checked = payment.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onTogglePayment(p.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      checked
                        ? "border-white/40 bg-white text-[#1E419A]"
                        : "border-[#CBD5E1] bg-white",
                    )}
                  >
                    {checked && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{t(p.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label={t("fieldRooms")}>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_OPTIONS.map((n) => {
              const checked = rooms.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onToggleRoom(n)}
                  className={cn(
                    "h-9 min-w-9 rounded-full border px-3 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {n === 4 ? "4+" : String(n)}
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label={t("cadastralCode")}>
          <input
            type="text"
            value={cadastralCode}
            onChange={(e) =>
              onChangeCadastral(sanitizeCadastralCode(e.target.value))
            }
            placeholder={t("cadastralPlaceholder")}
            className="h-[41px] w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-medium text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
          />
        </FilterCell>

        <FilterCell label={t("areaLabel")} className="md:col-span-2">
          <AreaRangePanel
            areaMin={areaMin}
            areaMax={areaMax}
            onChangeMin={onChangeAreaMin}
            onChangeMax={onChangeAreaMax}
          />
        </FilterCell>

        <FilterCell label={t("priceUsd")} className="md:col-span-2">
          <PriceRangePanel
            priceMin={priceMin}
            priceMax={priceMax}
            onChangeMin={onChangeMin}
            onChangeMax={onChangeMax}
          />
        </FilterCell>

        <FilterCell label={t("developer")} className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {DEVELOPER_OPTIONS.map((d) => {
              const checked = developers.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onToggleDeveloper(d.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#1E419A] bg-[#1E419A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </FilterCell>

        <FilterCell label={t("additional")} className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {AMENITY_CHIPS.map((a) => {
              const checked = amenities.includes(a.value);
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => onToggleAmenity(a.value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                    checked
                      ? "border-[#16A34A] bg-[#16A34A] text-white"
                      : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1]",
                  )}
                >
                  {t(a.labelKey)}
                </button>
              );
            })}
          </div>
        </FilterCell>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#F1F5F9] pt-4">
        <button
          type="button"
          onClick={onReset}
          data-testid={mobile ? "sale-mobile-filter-reset" : undefined}
          className={cn(
            "rounded-full px-5 text-[13px] font-bold text-[#64748B] transition-colors hover:text-[#1E293B]",
            mobile ? "min-h-11" : "h-10",
          )}
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={onApply}
          data-testid={mobile ? "sale-mobile-filter-apply" : undefined}
          className={cn(
            "rounded-full bg-[#16A34A] px-6 text-[13px] font-bold text-white transition-colors hover:bg-[#15803D]",
            mobile ? "min-h-11" : "h-10",
          )}
        >
          {t("applyFilter")}
        </button>
      </div>
    </div>
  );
}

function FilterCell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.6px] text-[#64748B]">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-[13px] font-bold transition-colors",
        selected
          ? "border-[#1E419A] bg-[#1E419A] text-white"
          : "border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#1E419A] hover:text-[#1E419A]",
      )}
    >
      {children}
    </button>
  );
}

function AreaRangePanel({
  areaMin,
  areaMax,
  onChangeMin,
  onChangeMax,
}: {
  areaMin: number;
  areaMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  const t = useTranslations("SaleSearchBox");
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#F1F5F9]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#1E419A]"
          style={{
            left: `${(areaMin / AREA_MAX_SLIDER) * 100}%`,
            right: `${100 - (areaMax / AREA_MAX_SLIDER) * 100}%`,
          }}
        />
        <input
          type="range"
          min={AREA_MIN}
          max={AREA_MAX_SLIDER}
          step={AREA_STEP}
          value={areaMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < areaMax) onChangeMin(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#1E419A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#1E419A] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
        <input
          type="range"
          min={AREA_MIN}
          max={AREA_MAX_SLIDER}
          step={AREA_STEP}
          value={areaMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > areaMin) onChangeMax(v);
          }}
          className="pointer-events-none absolute left-0 top-0 h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[#1E419A] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[#1E419A] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
        />
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">
            {t("minLabel")}
          </span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {t("sqmValue", { value: areaMin })}
          </span>
        </div>
        <div className="flex h-[41px] flex-1 items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4">
          <span className="text-[11px] font-bold text-[#94A3B8]">
            {t("maxLabel")}
          </span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">
            {areaMax === AREA_MAX_SLIDER
              ? t("sqmValuePlus", { value: areaMax })
              : t("sqmValue", { value: areaMax })}
          </span>
        </div>
      </div>
    </div>
  );
}
