"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import NumberField from "@/components/shared/NumberField";
import { StyledSelect } from "@/components/ui/styled-select";
import { AlertTriangle, MapPinned, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { readStoredActiveOrgId } from "@/lib/dashboard/orgScope";
import {
  isValidGePhone,
  isValidCadastralCode,
  sanitizeCadastralCode,
} from "@/lib/utils/number";
import {
  useCadastralTaken,
  isCadastralDuplicateError,
} from "@/lib/hooks/useCadastralTaken";
import type { Enums } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { scrollToField } from "@/lib/forms/scroll-to-error";
import { cn } from "@/lib/utils";
import {
  contentChangeErrorKey,
  isContentChangeError,
  submitContentChange,
} from "@/lib/content-change/client";
import {
  MANAGEMENT_SERVICES,
  RENOVATION_STATUSES,
} from "@/lib/constants/sale-listing";

const PROPERTY_TYPES: { value: Enums<"property_type"> }[] = [
  { value: "studio" },
  { value: "apartment" },
  { value: "cottage" },
  { value: "villa" },
  { value: "hotel" },
  { value: "land" },
];

const CONSTRUCTION_STATUSES: {
  value: "completed" | "under_construction" | "old_built";
}[] = [
  { value: "under_construction" },
  { value: "completed" },
  { value: "old_built" },
];

const MONTH_KEYS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

// Leading "" option lets the seller leave ROI unspecified (stored as null).
const ROI_OPTIONS: {
  value: string;
  label: string;
  min: number | null;
  max: number | null;
}[] = [
  { value: "", label: "", min: null, max: null },
  { value: "5-8", label: "5-8%", min: 5, max: 8 },
  { value: "8-12", label: "8-12%", min: 8, max: 12 },
  { value: "12-15", label: "12-15%", min: 12, max: 15 },
  { value: "15-plus", label: "15%+", min: 15, max: null },
];

const ExactLocationPicker = dynamic(
  () => import("@/components/maps/ExactLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-full items-center justify-center rounded-xl bg-[#E2E8F0]">
        <SkierLoader variant="inline" />
      </div>
    ),
  },
);

const TITLE_MAX = 35;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 15;

export default function CreateSalePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateSalePageInner />
    </Suspense>
  );
}

function CreateSalePageInner() {
  const t = useTranslations("CreateSale");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const tMonths = useTranslations("DateRangeFilter.months");
  const tFood = useTranslations("CreateFood");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();
  const zoneOptions = zones.map((z) => ({
    value: z.name_ka,
    label: z.name_ka,
  }));

  const propertyTypeOptions = useMemo(
    () =>
      PROPERTY_TYPES.map((o) => ({
        value: o.value,
        label: tOpts(`salePropertyTypes.${o.value}`),
      })),
    [tOpts],
  );

  const constructionStatusOptions = useMemo(
    () =>
      CONSTRUCTION_STATUSES.map((o) => ({
        value: o.value,
        label: tOpts(`constructionStatuses.${o.value}`),
      })),
    [tOpts],
  );

  const handoverMonthOptions = useMemo(
    () =>
      MONTH_KEYS.map((key, i) => ({
        value: String(i + 1),
        label: tMonths(key),
      })),
    [tMonths],
  );

  const renovationOptions = useMemo(
    () =>
      RENOVATION_STATUSES.map((o) => ({
        value: o.value,
        label: tOpts(`renovationStatuses.${o.value}`),
      })),
    [tOpts],
  );

  const managementOptions = useMemo(
    () =>
      MANAGEMENT_SERVICES.map((o) => ({
        value: o.value,
        label: tOpts(`managementServices.${o.value}`),
      })),
    [tOpts],
  );

  const roiOptions = useMemo(
    () =>
      ROI_OPTIONS.map((o) => ({
        value: o.value,
        label: o.value === "" ? tShared("notSpecified") : o.label,
      })),
    [tShared],
  );

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);
  // 0 = "post as" screen, 1 = property form. Only relevant when showPostAs.
  const [step, setStep] = useState(0);

  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [location, setLocation] = useState("");
  const [constructionStatus, setConstructionStatus] = useState<
    "completed" | "under_construction" | "old_built"
  >("under_construction");
  const [handoverMonth, setHandoverMonth] = useState("");
  const [handoverYear, setHandoverYear] = useState(
    String(new Date().getFullYear() + 1),
  );
  const [cadastralCode, setCadastralCode] = useState("");
  const cadastralTaken = useCadastralTaken(cadastralCode, editId);
  const [exactLocation, setExactLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [showMap, setShowMap] = useState(false);
  const [renovationStatus, setRenovationStatus] = useState("white_frame");
  const [managementService, setManagementService] =
    useState("complex_management");
  const [roiRange, setRoiRange] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [pricePerSqm, setPricePerSqm] = useState("");
  // Tracks which price the user last typed, so editing area recomputes the other.
  const [priceDriver, setPriceDriver] = useState<"total" | "perSqm" | null>(
    null,
  );
  const [description, setDescription] = useState("");
  const [developer, setDeveloper] = useState("");
  const [roiPercent, setRoiPercent] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [constructionPercent, setConstructionPercent] = useState(0);
  const [unitsTotal, setUnitsTotal] = useState("");
  const [unitsSold, setUnitsSold] = useState("");
  const [unitsReserved, setUnitsReserved] = useState("");

  // "Post as" — null = personal listing, otherwise an approved company the user
  // belongs to. Companies without an active subscription can't publish (DB
  // trigger enforces it; we also pre-check + warn here).
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  // The listing's org as hydrated in edit mode (null in create mode). The
  // active-sub pre-check and the update payload only apply when the value
  // actually changed — enforce_org_listing_rules fires on any UPDATE that
  // merely lists organization_id, even unchanged.
  const initialOrgIdRef = useRef<string | null>(null);
  const [companies, setCompanies] = useState<
    { id: string; brand_name: string; role: string; has_active_sub: boolean }[]
  >([]);
  // Gates the 1-screen vs 2-screen decision until the companies query resolves.
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCompaniesLoaded(true);
      return;
    }
    let cancelled = false;
    const sb = createClient();
    (async () => {
      const { data: mems } = await sb
        .from("organization_members")
        .select("role, organizations!inner(id, brand_name, status)")
        .eq("user_id", user.id)
        .eq("status", "approved");
      const rows = (mems ?? [])
        .map((m) => {
          const o = (m as { organizations: unknown }).organizations;
          const org = Array.isArray(o) ? o[0] : o;
          return {
            role: (m as { role: string }).role,
            org: org as { id: string; brand_name: string } | null,
          };
        })
        .filter((r) => r.org);
      const ids = rows.map((r) => r.org!.id);
      let activeSet = new Set<string>();
      if (ids.length) {
        const { data: subs } = await sb
          .from("organization_subscriptions")
          .select("organization_id")
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .in("organization_id", ids);
        activeSet = new Set(
          (subs ?? []).map(
            (s) => (s as { organization_id: string }).organization_id,
          ),
        );
      }
      if (cancelled) return;
      setCompanies(
        rows.map((r) => ({
          id: r.org!.id,
          brand_name: r.org!.brand_name,
          role: r.role,
          has_active_sub: activeSet.has(r.org!.id),
        })),
      );
      // Pre-select the dashboard's active company scope (create mode only —
      // edit mode hydrates the listing's own org). No active-sub check here:
      // the handleContinue gate + hint already cover subscription-less picks.
      if (!editId) {
        const stored = readStoredActiveOrgId();
        if (stored && rows.some((r) => r.org!.id === stored)) {
          setOrganizationId(stored);
        }
      }
      setCompaniesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, editId]);

  // A land plot has no building on it: no rooms/bathrooms, no construction or
  // handover metadata, no renovation state, no management service, no ROI.
  // Every one of those is hidden below AND written as null, because the display
  // surfaces rely on those columns being null rather than re-checking the type.
  const isLandPlot = propertyType === "land";
  const isUnderConstruction =
    !isLandPlot && constructionStatus === "under_construction";

  const handoverYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 8 }, (_, i) => currentYear + i);
    // Keep a hydrated out-of-range year (legacy rows) selectable.
    const selected = Number(handoverYear);
    if (Number.isFinite(selected) && !years.includes(selected)) {
      years.push(selected);
      years.sort((a, b) => a - b);
    }
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [handoverYear]);

  useEffect(() => {
    if (!editId || !user) return;
    let cancelled = false;

    (async () => {
      // No owner_id/organization_id filter here — RLS alone decides whether
      // this row is readable (own listing, or an org listing this user is an
      // approved member of), so this works regardless of which dashboard
      // scope the user last had selected.
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", editId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(tShared("listingNotFound"));
        setHydrating(false);
        return;
      }

      setTitle(data.title ?? "");
      setPropertyType((data.type ?? "apartment") as Enums<"property_type">);
      setLocation(data.location ?? "");
      setConstructionStatus(
        data.construction_status === "under_construction" ||
          data.construction_status === "old_built"
          ? data.construction_status
          : "completed",
      );
      setAreaSqm(data.area_sqm != null ? String(data.area_sqm) : "");
      setRooms(data.rooms != null ? String(data.rooms) : "");
      setBathrooms(data.bathrooms != null ? String(data.bathrooms) : "");
      setPriceUsd(data.sale_price != null ? String(data.sale_price) : "");
      // Pre-fill the per-m² convenience field from the stored total + area.
      if (
        data.sale_price != null &&
        data.area_sqm != null &&
        Number(data.area_sqm) > 0
      ) {
        setPricePerSqm(
          String(
            Math.round(
              (Number(data.sale_price) / Number(data.area_sqm)) * 100,
            ) / 100,
          ),
        );
        setPriceDriver("total");
      }
      setDescription(data.description ?? "");
      setDeveloper(data.developer ?? "");
      setRoiPercent(data.roi_percent != null ? String(data.roi_percent) : "");
      setCadastralCode(data.cadastral_code ?? "");
      if (data.renovation_status) {
        setRenovationStatus(data.renovation_status);
      }
      if (data.roi_percent != null) {
        const savedRoi = ROI_OPTIONS.find(
          (option) =>
            option.min === Number(data.roi_percent) &&
            option.max ===
              (data.roi_percent_max == null
                ? null
                : Number(data.roi_percent_max)),
        );
        if (savedRoi) setRoiRange(savedRoi.value);
      }
      setConstructionPercent(
        data.construction_progress_percent != null
          ? Number(data.construction_progress_percent)
          : 0,
      );
      if (data.completion_year != null) {
        setHandoverYear(String(data.completion_year));
      }
      setUnitsTotal(data.units_total != null ? String(data.units_total) : "");
      setUnitsSold(data.units_sold != null ? String(data.units_sold) : "");
      setUnitsReserved(
        data.units_reserved != null ? String(data.units_reserved) : "",
      );
      setOrganizationId(data.organization_id ?? null);
      initialOrgIdRef.current = data.organization_id ?? null;

      const rules =
        data.house_rules && typeof data.house_rules === "object"
          ? (data.house_rules as Record<string, unknown>)
          : {};
      const monthRaw = Number(rules.handover_month);
      if (Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12) {
        setHandoverMonth(String(monthRaw));
      }
      // Legacy rows stored a string like "2026 ბოლო"; salvage the year.
      if (
        data.completion_year == null &&
        typeof rules.handover_date === "string"
      ) {
        const legacyYear = rules.handover_date.match(/\d{4}/)?.[0];
        if (legacyYear) setHandoverYear(legacyYear);
      }
      if (typeof rules.exact_location === "string") {
        setExactLocation(rules.exact_location);
      }
      if (
        typeof data.location_lat === "number" &&
        typeof data.location_lng === "number"
      ) {
        setCoords({ lat: data.location_lat, lng: data.location_lng });
      }
      if (typeof rules.management_service === "string") {
        setManagementService(rules.management_service);
      }

      const stripPrefix = (v: string | null) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";
      setPhone(stripPrefix(data.phone));
      setWhatsapp(stripPrefix(data.whatsapp));
      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase, tShared]);

  // Two-way binding between total price and price/m², anchored on area.
  function handleAreaChange(value: string) {
    setAreaSqm(value);
    const a = Number(value);
    if (!(a > 0)) return;
    if (priceDriver === "perSqm") {
      const pps = Number(pricePerSqm);
      if (pps > 0) setPriceUsd(String(Math.round(pps * a)));
    } else if (priceDriver === "total") {
      const p = Number(priceUsd);
      if (p > 0) setPricePerSqm(String(Math.round((p / a) * 100) / 100));
    }
  }

  function handleTotalChange(value: string) {
    setPriceUsd(value);
    setPriceDriver("total");
    const a = Number(areaSqm);
    const p = Number(value);
    if (a > 0 && p > 0) {
      setPricePerSqm(String(Math.round((p / a) * 100) / 100));
    }
  }

  function handlePerSqmChange(value: string) {
    setPricePerSqm(value);
    setPriceDriver("perSqm");
    const a = Number(areaSqm);
    const pps = Number(value);
    if (a > 0 && pps > 0) {
      setPriceUsd(String(Math.round(pps * a)));
    }
  }

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!title.trim()) errs.push({ key: "title", message: t("invalidTitle") });
    if (!location.trim())
      errs.push({ key: "location", message: t("invalidLocation") });
    const cadastral = cadastralCode.trim();
    if (!cadastral) {
      errs.push({ key: "cadastralCode", message: t("enterCadastral") });
    } else if (!isValidCadastralCode(cadastral)) {
      errs.push({ key: "cadastralCode", message: t("invalidCadastral") });
    } else if (cadastralTaken) {
      errs.push({
        key: "cadastralCode",
        message: tShared("cadastralAlreadyUsed"),
      });
    }

    const areaNum = Number(areaSqm);
    if (!Number.isFinite(areaNum) || areaNum <= 0) {
      errs.push({ key: "areaSqm", message: t("invalidArea") });
    }

    const totalNum = Number(priceUsd);
    const ppsNum = Number(pricePerSqm);
    const hasTotal = Number.isFinite(totalNum) && totalNum > 0;
    const hasPerSqm = Number.isFinite(ppsNum) && ppsNum > 0;
    if (!hasTotal && !hasPerSqm) {
      errs.push({ key: "priceUsd", message: t("priceRequiredOneOf") });
    }

    if (photos.length < MIN_PHOTOS) {
      errs.push({
        key: "photos",
        message: tShared("minPhotosRequired", { count: MIN_PHOTOS }),
      });
    }

    if (!isValidGePhone(phone)) {
      errs.push({ key: "phone", message: tShared("invalidPhone") });
    }

    // Attaching to / switching company needs an active package; keeping the
    // hydrated value unchanged (or detaching) needs no check.
    if (organizationId && organizationId !== initialOrgIdRef.current) {
      const company = companies.find((c) => c.id === organizationId);
      if (!company || !company.has_active_sub) {
        errs.push({
          key: "organization",
          message: t("postAsNeedsPackageError"),
        });
      }
    }

    return errs;
  }

  async function handleSubmit() {
    if (!user) return;

    const errs = validate();
    if (errs.length > 0) {
      setInvalidFields(new Set(errs.map((e) => e.key)));
      setError(errs[0].message);
      scrollToField(errs[0].key);
      return;
    }
    setInvalidFields(new Set());

    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const titleTrimmed = title.trim();
      const locationTrimmed = location.trim();
      const cadastralCodeTrimmed = cadastralCode.trim();

      const areaNum = Number(areaSqm);
      // total price is canonical; derive it from price/m² when only that was filled
      const perSqmNum = Number(pricePerSqm);
      let priceNum = Number(priceUsd);
      if (!(priceNum > 0) && perSqmNum > 0 && areaNum > 0) {
        priceNum = Math.round(perSqmNum * areaNum);
      }

      const monthNum =
        isUnderConstruction && handoverMonth ? Number(handoverMonth) : null;
      const yearNum =
        isUnderConstruction && handoverYear.trim()
          ? Number(handoverYear)
          : null;
      const progressNum = isUnderConstruction ? constructionPercent : null;

      const parseOptionalNonNegative = (v: string): number | null => {
        if (!v.trim()) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return null;
        return n;
      };
      const roomsNum = parseOptionalNonNegative(rooms);
      const bathroomsNum = parseOptionalNonNegative(bathrooms);
      const roiOption = ROI_OPTIONS.find((option) => option.value === roiRange);
      const roiNum = roiOption?.min ?? parseOptionalNonNegative(roiPercent);
      const roiMaxNum = roiOption?.max ?? null;

      const unitsTotalNum = isUnderConstruction
        ? parseOptionalNonNegative(unitsTotal)
        : null;
      const unitsSoldNum = isUnderConstruction
        ? (parseOptionalNonNegative(unitsSold) ?? 0)
        : 0;
      const unitsReservedNum = isUnderConstruction
        ? (parseOptionalNonNegative(unitsReserved) ?? 0)
        : 0;
      if (
        unitsTotalNum !== null &&
        unitsSoldNum + unitsReservedNum > unitsTotalNum
      ) {
        throw new Error(t("soldReservedExceeds"));
      }

      const payload = {
        type: propertyType,
        title: titleTrimmed,
        description: description.trim() || null,
        location: locationTrimmed,
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
        area_sqm: areaNum,
        rooms: isLandPlot ? null : roomsNum,
        bathrooms: isLandPlot ? null : bathroomsNum,
        // The sale form has no capacity input, so a new listing never sets it —
        // but converting an existing apartment to land must clear the guest
        // count it already carries, or the cards render "N სტუმარი" on a plot.
        ...(isLandPlot ? { capacity: null } : {}),
        developer: developer.trim() || null,
        roi_percent: isLandPlot ? null : roiNum,
        roi_percent_max: isLandPlot ? null : roiMaxNum,
        photos,
        sale_price: priceNum,
        cadastral_code: cadastralCodeTrimmed,
        renovation_status: isLandPlot ? null : renovationStatus,
        construction_status: isLandPlot ? null : constructionStatus,
        construction_progress_percent: progressNum,
        completion_year: yearNum,
        units_total: unitsTotalNum,
        units_sold: unitsSoldNum,
        units_reserved: unitsReservedNum,
        house_rules: {
          handover_month: monthNum,
          exact_location: exactLocation.trim() || null,
          management_service: isLandPlot ? null : managementService,
          price_currency: "USD",
        },
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        is_for_sale: true,
      };

      if (editId) {
        // Same reasoning as the hydrate query above: no owner_id/organization_id
        // filter needed — RLS already permits the update for the owner or an
        // approved org member of this listing's company. organization_id is
        // included only when it changed: enforce_org_listing_rules fires on any
        // UPDATE whose SET list mentions the column, even with an unchanged
        // value, and would reject unrelated edits of a lapsed-sub org listing.
        const orgChanged = organizationId !== initialOrgIdRef.current;
        await submitContentChange("property", editId, payload);
        if (orgChanged) {
          const { error: organizationError } = await supabase
            .from("properties")
            .update({ organization_id: organizationId })
            .eq("id", editId);
          if (organizationError) throw organizationError;
        }
        router.push("/dashboard/seller");
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("properties")
          .insert({
            ...payload,
            owner_id: user.id,
            organization_id: organizationId,
            construction_stages: [],
            status: "pending" as Enums<"listing_status">,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        if (!inserted) throw new Error(tShared("genericError"));
        router.push("/dashboard/seller");
      }
    } catch (err) {
      if (isCadastralDuplicateError(err)) {
        setInvalidFields(new Set(["cadastralCode"]));
        setError(tShared("cadastralAlreadyUsed"));
        scrollToField("cadastralCode");
      } else {
        setError(
        isContentChangeError(err)
          ? tShared(contentChangeErrorKey(err))
          : formatSupabaseError(err, tShared("genericError")),
      );
      }
      submittingRef.current = false;
      setLoading(false);
    }
  }

  // Gate for advancing off the "post as" screen: a chosen company must have an
  // active subscription (mirrors the org branch of validate()).
  function handleContinue() {
    if (organizationId) {
      const company = companies.find((c) => c.id === organizationId);
      if (!company || !company.has_active_sub) {
        setInvalidFields(new Set(["organization"]));
        setError(t("postAsNeedsPackageError"));
        return;
      }
    }
    setInvalidFields(new Set());
    setError(null);
    setStep(1);
  }

  const requiredFilled = [
    title.trim().length > 0,
    location.trim().length > 0,
    cadastralCode.trim().length > 0,
    areaSqm.trim().length > 0,
    priceUsd.trim().length > 0 || pricePerSqm.trim().length > 0,
    photos.length >= MIN_PHOTOS,
    isValidGePhone(phone),
  ].filter(Boolean).length;
  const fieldPct = Math.round((requiredFilled / 7) * 100);

  // Show the "post as" screen only when creating (not editing) and the user
  // belongs to at least one approved company.
  const showPostAs = !isEditMode && companies.length > 0;
  const onScreenZero = showPostAs && step === 0;
  const companyMode = organizationId !== null;
  const selectedCompany =
    companies.find((c) => c.id === organizationId) ?? null;
  // Screen 0 reads ~25% to match the design; screen 1 never drops below that.
  const progressPercent = showPostAs
    ? onScreenZero
      ? 25
      : Math.max(25, fieldPct)
    : Math.max(10, fieldPct);
  // Wait for auth + the companies query before deciding 1-screen vs 2-screen,
  // so a multi-company seller doesn't flash the form then jump to screen 0.
  const booting =
    hydrating || (!isEditMode && (authLoading || !companiesLoaded));

  // Screen 0: choose to post as a person or on behalf of a company.
  const postAsScreen = (
    <Field label={t("postAsLabel")} required>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOrganizationId(null)}
            className={cn(
              "flex h-[120px] flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all",
              organizationId === null
                ? "border-[#2563EB] bg-[#EFF6FF]"
                : "border-[#E2E8F0] hover:border-[#CBD5E1]",
            )}
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF]">
                <User className="h-5 w-5 text-[#2563EB]" />
              </span>
              <PostAsRadio selected={organizationId === null} />
            </div>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-[#0F172A]">
                {t("postAsPerson")}
              </span>
              {user?.phone && (
                <span className="block truncate text-[12px] font-medium text-[#94A3B8]">
                  {user.phone}
                </span>
              )}
            </span>
          </button>

          {(() => {
            const display = selectedCompany ?? companies[0];
            if (!display) return null;
            return (
              <button
                type="button"
                onClick={() =>
                  setOrganizationId(organizationId ?? companies[0].id)
                }
                className={cn(
                  "flex h-[120px] flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all",
                  companyMode
                    ? "border-[#2563EB] bg-[#EFF6FF]"
                    : "border-[#E2E8F0] hover:border-[#CBD5E1]",
                )}
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-[12px] font-black uppercase text-white">
                    {display.brand_name.slice(0, 2)}
                  </span>
                  <PostAsRadio selected={companyMode} />
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-[#0F172A]">
                    {display.brand_name}
                  </span>
                  {display.has_active_sub ? (
                    <span className="block truncate text-[12px] font-medium text-[#94A3B8]">
                      {display.role === "owner"
                        ? t("postAsOwnerSuffix")
                        : t("postAsAgentSuffix")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 truncate text-[12px] font-bold text-[#B45309]">
                      {t("postAsCompanyHint")}
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    </span>
                  )}
                </span>
              </button>
            );
          })()}
        </div>

        <StyledSelect
          value={organizationId ?? ""}
          onValueChange={(v) => setOrganizationId(v)}
          options={companies.map((c) => ({
            value: c.id,
            label: `${c.brand_name} (${
              c.has_active_sub
                ? c.role === "owner"
                  ? t("postAsOwnerSuffix")
                  : t("postAsAgentSuffix")
                : t("postAsCompanyHint")
            })`,
          }))}
          placeholder={t("postAsSelectCompany")}
          accent="blue"
          disabled={!companyMode}
        />

        {companyMode && selectedCompany && !selectedCompany.has_active_sub && (
          <Link
            href={`/dashboard/seller/organizations/${selectedCompany.id}`}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[#B45309] hover:underline"
          >
            {t("postAsCompanyHint")} →
          </Link>
        )}
      </div>
    </Field>
  );

  return (
    <WizardShell
      title={t("pageTitle")}
      accent="green"
      progressPercent={progressPercent}
      onSubmit={(e) => {
        e.preventDefault();
        if (onScreenZero) {
          handleContinue();
        } else {
          handleSubmit();
        }
      }}
      footer={
        onScreenZero ? (
          <WizardFooter
            accent="green"
            backHref="/create"
            submitLabel={t("continue")}
            error={error}
          />
        ) : (
          <WizardFooter
            accent="green"
            {...(showPostAs
              ? {
                  onBack: () => {
                    setStep(0);
                    setError(null);
                    setInvalidFields(new Set());
                  },
                }
              : { backHref: "/create" })}
            submitLabel={
              isEditMode ? tShared("contentChange.submitForReview") : tShared("publishListing")
            }
            submitDisabled={loading}
            loading={loading}
            error={error}
          />
        )
      }
    >
      {booting ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={onScreenZero ? "postas" : "form"}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
          >
            {onScreenZero ? (
              postAsScreen
            ) : (
              <div className="space-y-8">
                {isEditMode &&
                  (companies.length > 0 || organizationId !== null) &&
                  postAsScreen}
                <WizardInnerCard
                  number={1}
                  title={t("sectionIdentity")}
                  accent="green"
                >
                  <Field
                    label={t("listingTitle")}
                    required
                    fieldKey="title"
                    error={invalidFields.has("title")}
                    helper={t("titleMaxHelper", { max: TITLE_MAX })}
                  >
                    <input
                      type="text"
                      value={title}
                      onChange={(e) =>
                        setTitle(e.target.value.slice(0, TITLE_MAX))
                      }
                      placeholder={t("titlePlaceholder")}
                      className={inputClass}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Field label={t("propertyType")} required>
                      <StyledSelect
                        value={propertyType}
                        onValueChange={setPropertyType}
                        options={propertyTypeOptions}
                        accent="blue"
                      />
                    </Field>

                    <Field
                      label={t("locationZone")}
                      required
                      fieldKey="location"
                      error={invalidFields.has("location")}
                    >
                      <StyledSelect
                        value={location}
                        onValueChange={setLocation}
                        options={zoneOptions}
                        placeholder={tShared("chooseZone")}
                        accent="blue"
                      />
                    </Field>
                  </div>

                  {!isLandPlot && (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <Field label={t("constructionStatus")} required>
                        <StyledSelect
                          value={constructionStatus}
                          onValueChange={setConstructionStatus}
                          options={constructionStatusOptions}
                          accent="blue"
                        />
                      </Field>

                      <Field
                        label={t("handoverDate")}
                        chip={
                          isUnderConstruction
                            ? { label: tShared("onlyUnderConstruction") }
                            : undefined
                        }
                      >
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <StyledSelect
                              value={handoverMonth}
                              onValueChange={setHandoverMonth}
                              options={handoverMonthOptions}
                              accent="blue"
                              disabled={!isUnderConstruction}
                            />
                          </div>
                          <div className="w-[104px] shrink-0">
                            <StyledSelect
                              value={handoverYear}
                              onValueChange={setHandoverYear}
                              options={handoverYearOptions}
                              accent="blue"
                              disabled={!isUnderConstruction}
                            />
                          </div>
                        </div>
                      </Field>
                    </div>
                  )}

                  <Field
                    label={t("cadastralCode")}
                    required
                    fieldKey="cadastralCode"
                    error={invalidFields.has("cadastralCode") || cadastralTaken}
                    helper={t("cadastralHelper")}
                  >
                    <input
                      type="text"
                      value={cadastralCode}
                      onChange={(e) =>
                        setCadastralCode(sanitizeCadastralCode(e.target.value))
                      }
                      placeholder="00.00.00.000..."
                      className={inputClass}
                    />
                    {cadastralTaken && (
                      <p className="text-xs font-bold text-[#EF4444]">
                        {tShared("cadastralAlreadyUsed")}
                      </p>
                    )}
                  </Field>

                  <div
                    className={cn(
                      "grid grid-cols-1 gap-5",
                      !isLandPlot && "md:grid-cols-2",
                    )}
                  >
                    {!isLandPlot && (
                      <Field label={t("roomsCount")}>
                        <NumberField
                          value={rooms}
                          onChange={setRooms}
                          min={0}
                          max={50}
                          integer
                          stepper
                          accent="green"
                          placeholder={t("roomsPlaceholder")}
                        />
                      </Field>
                    )}

                    <Field label={t("exactLocation")}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={exactLocation}
                          onChange={(e) => setExactLocation(e.target.value)}
                          placeholder={tFood("exactLocationPlaceholder")}
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setShowMap((v) => !v)}
                          aria-pressed={showMap}
                          aria-label={tShared("showOnMap")}
                          className="flex size-[48px] shrink-0 items-center justify-center rounded-xl bg-[#059669] text-white shadow-[0px_2px_4px_rgba(5,150,105,0.2)] transition-colors hover:bg-[#047857]"
                        >
                          <MapPinned className="size-5" />
                        </button>
                      </div>
                    </Field>
                  </div>

                  {showMap && (
                    <ExactLocationPicker value={coords} onChange={setCoords} />
                  )}
                </WizardInnerCard>

                {/* Renovation state, management service and ROI are all
                    building concepts — a bare plot has none of them. */}
                {!isLandPlot && (
                  <WizardInnerCard
                    number={2}
                    title={t("sectionCondition")}
                    accent="green"
                  >
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                      <Field label={t("renovationStatus")}>
                        <StyledSelect
                          value={renovationStatus}
                          onValueChange={setRenovationStatus}
                          options={renovationOptions}
                          accent="blue"
                        />
                      </Field>

                      <Field label={t("managementService")}>
                        <StyledSelect
                          value={managementService}
                          onValueChange={setManagementService}
                          options={managementOptions}
                          accent="blue"
                        />
                      </Field>

                      <Field label={t("expectedRoi")}>
                        <StyledSelect
                          value={roiRange}
                          onValueChange={setRoiRange}
                          options={roiOptions}
                          accent="blue"
                        />
                      </Field>
                    </div>
                  </WizardInnerCard>
                )}

                <WizardInnerCard
                  number={isLandPlot ? 2 : 3}
                  title={t("sectionFinance")}
                  accent="green"
                >
                  <Field
                    label={t(isLandPlot ? "plotArea" : "totalArea")}
                    required
                    fieldKey="areaSqm"
                    error={invalidFields.has("areaSqm")}
                  >
                    <NumberField
                      value={areaSqm}
                      onChange={handleAreaChange}
                      min={0}
                      max={100000}
                      decimals={1}
                      accent="green"
                      placeholder="0"
                      suffix={tShared("sqm")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Field
                      label={t("pricePerSqmLabel")}
                      helper={t("orFillPerSqm")}
                      fieldKey="priceUsd"
                      error={invalidFields.has("priceUsd")}
                    >
                      <NumberField
                        value={pricePerSqm}
                        onChange={handlePerSqmChange}
                        min={0}
                        max={1000000}
                        integer
                        accent="green"
                        placeholder="0"
                        prefix="$"
                      />
                    </Field>

                    <Field
                      label={t("priceUsd")}
                      required
                      fieldKey="priceUsd"
                      error={invalidFields.has("priceUsd")}
                    >
                      <NumberField
                        value={priceUsd}
                        onChange={handleTotalChange}
                        min={1}
                        max={10000000}
                        integer
                        accent="green"
                        placeholder="0"
                        prefix="$"
                      />
                    </Field>
                  </div>

                  <Field
                    label={t("photosRenders")}
                    required
                    fieldKey="photos"
                    error={invalidFields.has("photos")}
                    labelOnlyError
                    chip={{
                      label: tShared("minPhotosShort", { count: MIN_PHOTOS }),
                      variant: "blue",
                    }}
                    chipPosition="end"
                  >
                    <PhotoUploader
                      photos={photos}
                      onPhotosChange={setPhotos}
                      maxPhotos={MAX_PHOTOS}
                      variant="figma"
                    />
                  </Field>
                </WizardInnerCard>

                <WizardInnerCard
                  number={isLandPlot ? 3 : 4}
                  title={t("sectionDetailsContact")}
                  accent="green"
                >
                  <Field label={tShared("description")}>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("descriptionPlaceholder")}
                      rows={5}
                      className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Field
                      label={tShared("phoneNumber")}
                      required
                      fieldKey="phone"
                      error={invalidFields.has("phone")}
                    >
                      <PhoneInput
                        value={phone}
                        onChange={setPhone}
                        error={
                          invalidFields.has("phone")
                            ? tShared("invalidPhone")
                            : null
                        }
                      />
                    </Field>
                    <Field
                      label={tShared("whatsappNumber")}
                      helper={tShared("optional")}
                    >
                      <PhoneInput value={whatsapp} onChange={setWhatsapp} />
                    </Field>
                  </div>
                </WizardInnerCard>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]";

function PostAsRadio({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
        selected ? "border-[#2563EB]" : "border-[#CBD5E1]",
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-[#2563EB]" />}
    </span>
  );
}

function Field({
  label,
  required,
  helper,
  chip,
  chipPosition = "inline",
  fieldKey,
  error,
  labelOnlyError,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  chip?: { label: string; variant?: "green" | "blue" };
  chipPosition?: "inline" | "end";
  fieldKey?: string;
  error?: boolean;
  /** Only redden the label (for controls whose own buttons shouldn't turn red). */
  labelOnlyError?: boolean;
  children: React.ReactNode;
}) {
  const chipEl = chip ? (
    <span
      className={
        chip.variant === "blue"
          ? "rounded-md bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold text-[#1D4ED8]"
          : "rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]"
      }
    >
      {chip.label}
    </span>
  ) : null;

  return (
    <div
      data-field={fieldKey}
      className={cn(
        "space-y-2 scroll-mt-24",
        error &&
          !labelOnlyError &&
          "[&_input]:border-[#EF4444] [&_textarea]:border-[#EF4444] [&_button]:border-[#EF4444] [&_input]:ring-2 [&_input]:ring-[#FEE2E2] [&_textarea]:ring-2 [&_textarea]:ring-[#FEE2E2]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "text-[13px] font-bold",
              error ? "text-[#EF4444]" : "text-[#334155]",
            )}
          >
            {label}
            {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
          </label>
          {chipPosition === "inline" && chipEl}
        </div>
        {chipPosition === "end" && chipEl}
      </div>
      {children}
      {helper && (
        <p className="text-right text-xs font-medium text-[#94A3B8]">
          {helper}
        </p>
      )}
    </div>
  );
}
