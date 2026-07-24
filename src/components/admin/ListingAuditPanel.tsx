"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import PhotoUploader from "@/components/forms/PhotoUploader";
import SharedDateField from "@/components/shared/DateField";
import { SkierLoader } from "@/components/shared/SkierLoader";
import {
  FOOD_AMENITIES,
  HOSTING_LANGS,
  optionKeyFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import { formatPhone } from "@/lib/utils/format";
import { clampNumber, sanitizeCadastralCode } from "@/lib/utils/number";
import type {
  AuditPayload,
  AuditPropertyListing,
  AuditServiceListing,
} from "@/app/api/admin/listings/audit/route";
import type { Enums, Tables } from "@/lib/types/database";

const ExactLocationPicker = dynamic(
  () => import("@/components/maps/ExactLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] w-full items-center justify-center rounded-xl bg-[#E2E8F0]">
        <SkierLoader variant="inline" />
      </div>
    ),
  },
);

type Props = {
  kind: "property" | "service";
  id: string;
  onModerated?: (action: "approve" | "reject") => void;
  onChange?: () => void;
};

type PropertyDraft = Partial<Tables<"properties">>;
type ServiceDraft = Partial<Tables<"services">>;

const STATUS_OPTIONS: Enums<"listing_status">[] = [
  "active",
  "pending",
  "blocked",
  "draft",
];

const PROPERTY_TYPE_OPTIONS: Enums<"property_type">[] = [
  "apartment",
  "studio",
  "cottage",
  "hotel",
  "villa",
  "land",
];

const SERVICE_CATEGORY_OPTIONS: Enums<"service_category">[] = [
  "food",
  "transport",
  "entertainment",
  "employment",
  "handyman",
  "cleaning",
];

const CONSTRUCTION_STATUS_VALUES = [
  "ready",
  "under_construction",
  "planned",
] as const;

const RENOVATION_STATUS_VALUES = [
  "new_renovation",
  "old_renovation",
  "black_frame",
  "white_frame",
  "green_frame",
] as const;

const ROOM_TYPE_VALUES = [
  "studio",
  "1_bedroom",
  "2_bedroom",
  "3_bedroom",
  "4_plus_bedroom",
] as const;

// Mirrors AMENITY_GROUPS in listing-options; labels render from the
// ListingOptions.{amenityGroupLabels,amenities} messages.
const AMENITY_GROUP_KEYS: { key: string; options: string[] }[] = [
  {
    key: "winter",
    options: ["ski_in_out", "ski_storage", "backup_generator", "fireplace"],
  },
  { key: "comfort", options: ["parking", "wifi", "central_heating", "tv"] },
  {
    key: "kitchen",
    options: ["washing_machine", "dishwasher", "full_kitchen", "coffee_maker"],
  },
  {
    key: "outdoor",
    options: [
      "no_balcony",
      "french_balcony",
      "standard_balcony",
      "large_terrace",
      "yard",
    ],
  },
];

export default function ListingAuditPanel({
  kind,
  id,
  onModerated,
  onChange,
}: Props) {
  const t = useTranslations("AdminShared.listingAudit");
  const tShared = useTranslations("AdminShared");
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<null | "save" | "approve" | "reject">(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadErr(null);
    setData(null);
    setDraft({});
    async function load() {
      try {
        const res = await fetch(
          `/api/admin/listings/audit?kind=${kind}&id=${id}`,
          { cache: "no-store" },
        );
        const payload = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(payload.error ?? t("loadFailed"));
        setData(payload as AuditPayload);
      } catch (err) {
        if (!active) return;
        setLoadErr(err instanceof Error ? err.message : tShared("error"));
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [kind, id, reloadToken, t, tShared]);

  const dirtyPatch = useMemo(() => {
    if (!data) return {};
    const out: Record<string, unknown> = {};
    const listing = data.listing as Record<string, unknown>;
    for (const key of Object.keys(draft)) {
      if (!shallowEqual(draft[key], listing[key])) {
        out[key] = draft[key];
      }
    }
    return out;
  }, [draft, data]);

  const isDirty = Object.keys(dirtyPatch).length > 0;

  function setField(field: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function effective<T>(field: string, fallback: T): T {
    if (field in draft) return draft[field] as T;
    if (!data) return fallback;
    const v = (data.listing as Record<string, unknown>)[field];
    return (v ?? fallback) as T;
  }

  async function saveDirty(): Promise<boolean> {
    if (!isDirty) return true;
    const res = await fetch("/api/admin/listings/update", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id, patch: dirtyPatch }),
    });
    const payload = (await res.json().catch(() => null)) as {
      error?: string;
      details?: { field: string; reason: string }[];
    } | null;
    if (!res.ok) {
      const detail = payload?.details?.[0];
      throw new Error(
        detail
          ? `${detail.field}: ${detail.reason}`
          : payload?.error || tShared("saveFailed"),
      );
    }
    return true;
  }

  async function moderate(action: "approve" | "reject") {
    if (!data) return;
    const notes =
      typeof draft.admin_notes === "string"
        ? draft.admin_notes
        : (data.listing.admin_notes ?? "");

    setBusy(action);
    try {
      await saveDirty();
      const res = await fetch("/api/admin/listings/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          action,
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? tShared("error"));
      toast.success(
        action === "approve"
          ? tShared("listingApproved")
          : tShared("listingRejected"),
      );
      onModerated?.(action);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setBusy(null);
    }
  }

  async function saveOnly() {
    if (!data || !isDirty) return;
    setBusy("save");
    try {
      const count = Object.keys(dirtyPatch).length;
      await saveDirty();
      toast.success(t("savedChanges", { count }));
      setDraft({});
      setReloadToken((n) => n + 1);
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tShared("error"));
    } finally {
      setBusy(null);
    }
  }

  if (loadErr) {
    return (
      <div className="m-4 flex items-center gap-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm font-semibold text-[#B91C1C]">
        <AlertCircle className="h-5 w-5" />
        {loadErr}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl md:col-span-2" />
      </div>
    );
  }

  const isProperty = data.kind === "property";
  const titleVal = effective<string>("title", "");
  const titleOk = titleVal.trim().length > 0;
  const moderationDisabled = busy != null || !titleOk;

  return (
    <div className="space-y-4 bg-[#F8FAFC] p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <OwnerCard owner={data.owner} />
        {isProperty && (
          <NaprCard
            cadastralCode={effective<string | null>("cadastral_code", null)}
            onChange={(v) => setField("cadastral_code", v)}
          />
        )}
      </div>

      {isProperty ? (
        <PropertyForm
          listing={data.listing as AuditPropertyListing}
          draft={draft as PropertyDraft}
          setField={setField}
          effective={effective}
        />
      ) : (
        <ServiceForm
          listing={data.listing as AuditServiceListing}
          draft={draft as ServiceDraft}
          setField={setField}
          effective={effective}
        />
      )}

      <ActionBar
        busy={busy}
        isDirty={isDirty}
        disabled={moderationDisabled}
        onSave={saveOnly}
        onApprove={() => moderate("approve")}
        onReject={() => moderate("reject")}
      />
    </div>
  );
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null
  ) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (!shallowEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

// Legacy production rows store Georgian labels ("პარკინგი", "ქართული") while
// the panel's chips use codes ("parking", "ka"). A chip is active if any
// stored value normalizes to its code; toggling off removes every such value,
// toggling on appends the code. Unrecognized free-text values are never touched.
function chipIsActive(group: OptionGroup, selected: string[], key: string) {
  return selected.some((v) => v === key || optionKeyFor(group, v) === key);
}

function chipToggle(
  group: OptionGroup,
  selected: string[],
  key: string,
): string[] {
  return chipIsActive(group, selected, key)
    ? selected.filter((v) => v !== key && optionKeyFor(group, v) !== key)
    : [...selected, key];
}

// Selects write codes, but the stored value may be a legacy Georgian label.
// Map it onto its code option when one exists; otherwise append a passthrough
// option (key ? translated label : raw value) so the current value stays
// visible and unchanged until the admin explicitly picks a code.
function resolveLegacySelect(
  group: OptionGroup,
  raw: string,
  options: { value: string; label: string }[],
  legacyLabel: (key: string) => string,
): { value: string; options: { value: string; label: string }[] } {
  if (!raw || options.some((o) => o.value === raw)) {
    return { value: raw, options };
  }
  const key = optionKeyFor(group, raw);
  if (key && options.some((o) => o.value === key)) {
    return { value: key, options };
  }
  return {
    value: raw,
    options: [...options, { value: raw, label: key ? legacyLabel(key) : raw }],
  };
}

// ---------- Owner & NAPR ----------

function OwnerCard({ owner }: { owner: AuditPayload["owner"] }) {
  const t = useTranslations("AdminShared.listingAudit");
  const tDash = useTranslations("DashboardShared");
  const tGuest = useTranslations("GuestProfile");

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#475569]">
        <UserIcon className="h-4 w-4" />
        {t("ownerInfo")}
        {owner.is_verified && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
            <BadgeCheck className="h-3 w-3" />
            {t("verified")}
          </span>
        )}
      </div>
      <dl className="space-y-3 text-sm">
        <RowLine icon={<UserIcon className="h-4 w-4" />} label={tDash("name")}>
          {owner.display_name ?? "—"}
        </RowLine>
        <RowLine icon={<Phone className="h-4 w-4" />} label={tDash("phone")}>
          {formatPhone(owner.phone)}
        </RowLine>
        <RowLine icon={<Mail className="h-4 w-4" />} label={tGuest("email")}>
          {owner.email ?? "—"}
        </RowLine>
        <RowLine
          icon={<ShieldCheck className="h-4 w-4" />}
          label={t("personalId")}
        >
          <span className="font-mono">{owner.personal_id ?? "—"}</span>
        </RowLine>
      </dl>
    </div>
  );
}

function NaprCard({
  cadastralCode,
  onChange,
}: {
  cadastralCode: string | null;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("AdminShared.listingAudit");

  return (
    <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#1D4ED8]">
        <Building2 className="h-4 w-4" />
        {t("legalNapr")}
      </div>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-[#475569]">
            {t("cadastralCode")}
          </span>
          <input
            type="text"
            value={cadastralCode ?? ""}
            onChange={(e) => onChange(sanitizeCadastralCode(e.target.value))}
            placeholder={t("cadastralPlaceholder")}
            className="w-full rounded-xl border border-[#BFDBFE] bg-white px-3 py-2 font-mono text-[15px] font-bold text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
          />
        </label>
        <a
          href="https://napr.gov.ge/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1D4ED8] hover:underline"
        >
          {t("naprCheck")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ---------- Property form ----------

type FieldSetters = {
  setField: (field: string, value: unknown) => void;
  effective: <T>(field: string, fallback: T) => T;
};

function PropertyForm({
  listing,
  setField,
  effective,
}: {
  listing: AuditPropertyListing;
  draft: PropertyDraft;
  setField: FieldSetters["setField"];
  effective: FieldSetters["effective"];
}) {
  const t = useTranslations("AdminShared.listingAudit");
  const tOpts = useTranslations("ListingOptions");
  const houseRules = effective<Record<string, unknown> | null>(
    "house_rules",
    null,
  );
  const rulesObj =
    houseRules && typeof houseRules === "object" && !Array.isArray(houseRules)
      ? (houseRules as Record<string, unknown>)
      : {};
  const hostingLangs = Array.isArray(rulesObj.hosting_langs)
    ? (rulesObj.hosting_langs as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const smoking =
    typeof rulesObj.smoking === "boolean" ? rulesObj.smoking : null;
  const pets = typeof rulesObj.pets === "boolean" ? rulesObj.pets : null;

  function updateRule(patch: Record<string, unknown>) {
    setField("house_rules", { ...rulesObj, ...patch });
  }

  const isForSale = effective<boolean>("is_for_sale", !!listing.is_for_sale);

  const constructionSelect = resolveLegacySelect(
    "constructionStatuses",
    effective<string | null>("construction_status", null) ?? "",
    [
      { value: "", label: "—" },
      ...CONSTRUCTION_STATUS_VALUES.map((value) => ({
        value,
        label: t(`constructionStatuses.${value}`),
      })),
    ],
    (key) => tOpts(`constructionStatuses.${key}`),
  );

  const renovationSelect = resolveLegacySelect(
    "renovationStatuses",
    effective<string | null>("renovation_status", null) ?? "",
    [
      { value: "", label: "—" },
      ...RENOVATION_STATUS_VALUES.map((value) => ({
        value,
        label: t(`renovationStatuses.${value}`),
      })),
    ],
    (key) => tOpts(`renovationStatuses.${key}`),
  );

  return (
    <div className="space-y-4">
      <Section title={t("basicInfo")} defaultOpen>
        <Grid2>
          <TextField
            label={t("title")}
            required
            value={effective<string>("title", "")}
            onChange={(v) => setField("title", v)}
          />
          <SelectField
            label={t("propertyType")}
            value={effective<string>("type", listing.type)}
            onChange={(v) => setField("type", v)}
            options={PROPERTY_TYPE_OPTIONS.map((type) => ({
              value: type,
              label: tOpts(`propertyTypes.${type}`),
            }))}
          />
        </Grid2>
        <TextAreaField
          label={t("description")}
          value={effective<string | null>("description", null) ?? ""}
          onChange={(v) => setField("description", v)}
          rows={5}
        />
        <Grid2>
          <ToggleField
            label={t("forSaleObject")}
            help={t("forSaleHelp")}
            value={isForSale}
            onChange={(v) => setField("is_for_sale", v)}
          />
        </Grid2>
      </Section>

      <Section title={t("location")} defaultOpen>
        <TextField
          label={t("address")}
          required
          value={effective<string>("location", "")}
          onChange={(v) => setField("location", v)}
        />
        <Grid2>
          <NumberField
            label={t("areaSqm")}
            value={effective<number | null>("area_sqm", null)}
            onChange={(v) => setField("area_sqm", v)}
            step="0.1"
            min={0}
            max={10000}
          />
          <NumberField
            label={t("distanceToSlope")}
            value={effective<number | null>("distance_to_slope_m", null)}
            onChange={(v) => setField("distance_to_slope_m", v)}
            min={0}
            max={50000}
          />
        </Grid2>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
            <MapPin className="h-4 w-4" />
            {t("exactLocation")}
          </p>
          <div className="h-[280px] w-full">
            <ExactLocationPicker
              value={
                effective<number | null>("location_lat", null) != null &&
                effective<number | null>("location_lng", null) != null
                  ? {
                      lat: effective<number>("location_lat", 0),
                      lng: effective<number>("location_lng", 0),
                    }
                  : null
              }
              onChange={(coords) => {
                setField("location_lat", coords.lat);
                setField("location_lng", coords.lng);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title={t("specification")} defaultOpen>
        <Grid3>
          <NumberField
            label={t("rooms")}
            value={effective<number | null>("rooms", null)}
            onChange={(v) => setField("rooms", v)}
            min={0}
            max={50}
            integer
          />
          <NumberField
            label={t("bathrooms")}
            value={effective<number | null>("bathrooms", null)}
            onChange={(v) => setField("bathrooms", v)}
            min={0}
            max={30}
            integer
          />
          <NumberField
            label={t("capacity")}
            value={effective<number | null>("capacity", null)}
            onChange={(v) => setField("capacity", v)}
            min={1}
            max={200}
            integer
          />
          <SelectField
            label={t("roomType")}
            value={effective<string | null>("room_type", null) ?? ""}
            onChange={(v) => setField("room_type", v || null)}
            options={[
              { value: "", label: "—" },
              ...ROOM_TYPE_VALUES.map((value) => ({
                value,
                label: t(`roomTypes.${value}`),
              })),
            ]}
          />
          <NumberField
            label={t("hotelStars")}
            value={effective<number | null>("hotel_stars", null)}
            onChange={(v) => setField("hotel_stars", v)}
            step="0.5"
            min={0}
            max={5}
          />
          <NumberField
            label={t("minNights")}
            value={effective<number | null>("min_booking_days", null)}
            onChange={(v) => setField("min_booking_days", v)}
            min={0}
            max={365}
            integer
          />
        </Grid3>
      </Section>

      <Section title={t("price")}>
        <Grid3>
          {!isForSale && (
            <NumberField
              label={t("pricePerNight")}
              value={effective<number | null>("price_per_night", null)}
              onChange={(v) => setField("price_per_night", v)}
              step="0.01"
              min={0}
              max={100000}
            />
          )}
          {isForSale && (
            <NumberField
              label={t("salePrice")}
              value={effective<number | null>("sale_price", null)}
              onChange={(v) => setField("sale_price", v)}
              step="0.01"
              min={0}
              max={1000000}
            />
          )}
          <TextField
            label={t("currency")}
            value={effective<string | null>("currency", null) ?? ""}
            onChange={(v) => setField("currency", v)}
            placeholder="₾"
          />
          <NumberField
            label={t("discountPercent")}
            value={effective<number | null>("discount_percent", null)}
            onChange={(v) => setField("discount_percent", v)}
            min={0}
            max={100}
          />
          <NumberField
            label={t("cleaningFee")}
            value={effective<number | null>("cleaning_fee", null)}
            onChange={(v) => setField("cleaning_fee", v)}
            step="0.01"
            min={0}
            max={10000}
          />
          <NumberField
            label={t("roiPercent")}
            value={effective<number | null>("roi_percent", null)}
            onChange={(v) => setField("roi_percent", v)}
            step="0.1"
            min={0}
            max={100}
          />
        </Grid3>
      </Section>

      <Section title={t("amenitiesRules")}>
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
          {t("amenities")}
        </p>
        <AmenityChips
          selected={effective<string[]>("amenities", []) as string[]}
          onChange={(next) => setField("amenities", next)}
        />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
              {t("hostLanguages")}
            </p>
            <ChipsField
              group="hostingLangs"
              options={HOSTING_LANGS.map((lang) => ({
                key: lang.key,
                label: tOpts(`hostingLangs.${lang.key}`),
              }))}
              selected={hostingLangs}
              onChange={(next) =>
                updateRule({
                  hosting_langs: next,
                })
              }
            />
          </div>
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
              {t("houseRules")}
            </p>
            <div className="flex flex-col gap-2">
              <TriState
                label={t("smokingAllowed")}
                value={smoking}
                onChange={(v) => updateRule({ smoking: v })}
              />
              <TriState
                label={t("petsAllowed")}
                value={pets}
                onChange={(v) => updateRule({ pets: v })}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("photos")}>
        <PhotoUploader
          photos={effective<string[]>("photos", []) as string[]}
          onPhotosChange={(next) => setField("photos", next)}
          maxPhotos={20}
        />
      </Section>

      <Section title={t("statusVisibility")} defaultOpen>
        <Grid3>
          <SelectField
            label={t("status")}
            value={effective<string | null>("status", null) ?? "pending"}
            onChange={(v) => setField("status", v)}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: tOpts(`listingStatuses.${s}`),
            }))}
          />
          <ToggleField
            label="VIP"
            value={effective<boolean | null>("is_vip", null) === true}
            onChange={(v) => setField("is_vip", v)}
          />
          <ToggleField
            label="Super VIP"
            value={effective<boolean | null>("is_super_vip", null) === true}
            onChange={(v) => setField("is_super_vip", v)}
          />
          <ToggleField
            label={t("b2bPartner")}
            value={effective<boolean | null>("is_b2b_partner", null) === true}
            onChange={(v) => setField("is_b2b_partner", v)}
          />
          <DateField
            label={t("vipExpiry")}
            value={effective<string | null>("vip_expires_at", null)}
            onChange={(v) => setField("vip_expires_at", v)}
          />
        </Grid3>
        <TextAreaField
          label={t("adminComment")}
          value={effective<string | null>("admin_notes", null) ?? ""}
          onChange={(v) => setField("admin_notes", v)}
          rows={3}
          placeholder={t("adminCommentPlaceholder")}
        />
      </Section>

      {isForSale && (
        <Section title={t("constructionStatus")}>
          <Grid3>
            <SelectField
              label={t("constructionStatusLabel")}
              value={constructionSelect.value}
              onChange={(v) => setField("construction_status", v || null)}
              options={constructionSelect.options}
            />
            <NumberField
              label={t("progressPercent")}
              value={effective<number | null>(
                "construction_progress_percent",
                null,
              )}
              onChange={(v) => setField("construction_progress_percent", v)}
              min={0}
              max={100}
              integer
            />
            <NumberField
              label={t("completionYear")}
              value={effective<number | null>("completion_year", null)}
              onChange={(v) => setField("completion_year", v)}
              min={2020}
              max={2100}
              integer
            />
            <TextField
              label={t("developer")}
              value={effective<string | null>("developer", null) ?? ""}
              onChange={(v) => setField("developer", v)}
            />
            <SelectField
              label={t("renovationStatus")}
              value={renovationSelect.value}
              onChange={(v) => setField("renovation_status", v || null)}
              options={renovationSelect.options}
            />
          </Grid3>
          <TextAreaField
            label={t("progressNote")}
            value={effective<string | null>("progress_note", null) ?? ""}
            onChange={(v) => setField("progress_note", v)}
            rows={2}
          />
        </Section>
      )}
    </div>
  );
}

// ---------- Service form ----------

function ServiceForm({
  listing,
  setField,
  effective,
}: {
  listing: AuditServiceListing;
  draft: ServiceDraft;
  setField: FieldSetters["setField"];
  effective: FieldSetters["effective"];
}) {
  const t = useTranslations("AdminShared.listingAudit");
  const tDash = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const category = effective<Enums<"service_category">>(
    "category",
    listing.category,
  );
  const isFood = category === "food";
  const isTransport = category === "transport";
  const isEmployment = category === "employment";

  return (
    <div className="space-y-4">
      <Section title={t("basicInfo")} defaultOpen>
        <Grid2>
          <TextField
            label={t("title")}
            required
            value={effective<string>("title", "")}
            onChange={(v) => setField("title", v)}
          />
          <SelectField
            label={t("category")}
            value={category}
            onChange={(v) => setField("category", v)}
            options={SERVICE_CATEGORY_OPTIONS.map((c) => ({
              value: c,
              label: tOpts(`serviceCategories.${c}`),
            }))}
          />
        </Grid2>
        <TextAreaField
          label={t("description")}
          value={effective<string | null>("description", null) ?? ""}
          onChange={(v) => setField("description", v)}
          rows={5}
        />
      </Section>

      <Section title={t("contactLocation")} defaultOpen>
        <Grid2>
          <TextField
            label={t("address")}
            value={effective<string | null>("location", null) ?? ""}
            onChange={(v) => setField("location", v)}
          />
          <TextField
            label={tDash("phone")}
            value={effective<string | null>("phone", null) ?? ""}
            onChange={(v) => setField("phone", v)}
            placeholder="+995 5XX XX XX XX"
          />
        </Grid2>
      </Section>

      <Section title={t("price")}>
        <Grid3>
          <NumberField
            label={t("price")}
            value={effective<number | null>("price", null)}
            onChange={(v) => setField("price", v)}
            step="0.01"
            min={0}
            max={100000}
          />
          <TextField
            label={t("priceUnit")}
            value={effective<string | null>("price_unit", null) ?? ""}
            onChange={(v) => setField("price_unit", v)}
            placeholder={t("priceUnitPlaceholder")}
          />
          <TextField
            label={t("currency")}
            value={effective<string | null>("currency", null) ?? ""}
            onChange={(v) => setField("currency", v)}
            placeholder="₾"
          />
          <NumberField
            label={t("discountPercent")}
            value={effective<number | null>("discount_percent", null)}
            onChange={(v) => setField("discount_percent", v)}
            min={0}
            max={100}
          />
        </Grid3>
      </Section>

      {isFood && (
        <Section title={t("foodSpec")} defaultOpen>
          <Grid2>
            <TextField
              label={t("cuisineType")}
              value={effective<string | null>("cuisine_type", null) ?? ""}
              onChange={(v) => setField("cuisine_type", v)}
            />
            <TextField
              label={t("avgCheck")}
              value={effective<string | null>("avg_check", null) ?? ""}
              onChange={(v) => setField("avg_check", v)}
            />
            <TextField
              label={t("operatingHours")}
              value={effective<string | null>("operating_hours", null) ?? ""}
              onChange={(v) => setField("operating_hours", v)}
            />
            <TextField
              label={t("menuUrl")}
              value={effective<string | null>("menu_url", null) ?? ""}
              onChange={(v) => setField("menu_url", v)}
            />
            <TextField
              label={t("accommodation")}
              value={effective<string | null>("accommodation", null) ?? ""}
              onChange={(v) => setField("accommodation", v)}
            />
            <TextField
              label={t("meals")}
              value={effective<string | null>("meals", null) ?? ""}
              onChange={(v) => setField("meals", v)}
            />
          </Grid2>
          <Grid2>
            {FOOD_AMENITIES.map((a) => (
              <ToggleField
                key={a.key}
                label={tOpts(`foodAmenities.${a.key}`)}
                value={effective<boolean | null>(a.key, null) === true}
                onChange={(v) => setField(a.key, v)}
              />
            ))}
          </Grid2>
        </Section>
      )}

      {isTransport && (
        <Section title={t("transportSpec")} defaultOpen>
          <Grid2>
            <TextField
              label={t("driverName")}
              value={effective<string | null>("driver_name", null) ?? ""}
              onChange={(v) => setField("driver_name", v)}
            />
            <TextField
              label={t("vehicle")}
              value={effective<string | null>("vehicle_make", null) ?? ""}
              onChange={(v) => setField("vehicle_make", v)}
            />
            <NumberField
              label={t("vehicleCapacity")}
              value={effective<number | null>("vehicle_capacity", null)}
              onChange={(v) => setField("vehicle_capacity", v)}
              min={1}
              max={100}
              integer
            />
            <TextField
              label={t("transportType")}
              value={effective<string | null>("transport_type", null) ?? ""}
              onChange={(v) => setField("transport_type", v)}
            />
            <TextField
              label={t("mainRoute")}
              value={effective<string | null>("route", null) ?? ""}
              onChange={(v) => setField("route", v)}
            />
          </Grid2>
          <ListField
            label={t("extraRoutes")}
            value={effective<string[] | null>("routes", null) ?? []}
            onChange={(next) => setField("routes", next)}
          />
        </Section>
      )}

      {isEmployment && (
        <Section title={t("employmentSpec")} defaultOpen>
          <Grid2>
            <TextField
              label={t("position")}
              value={effective<string | null>("position", null) ?? ""}
              onChange={(v) => setField("position", v)}
            />
            <TextField
              label={t("salaryRange")}
              value={effective<string | null>("salary_range", null) ?? ""}
              onChange={(v) => setField("salary_range", v)}
              placeholder="500-1000"
            />
            <NumberField
              label={t("salaryMin")}
              value={effective<number | null>("salary_min", null)}
              onChange={(v) => setField("salary_min", v)}
              min={0}
              max={1000000}
            />
            <NumberField
              label={t("salaryMax")}
              value={effective<number | null>("salary_max", null)}
              onChange={(v) => setField("salary_max", v)}
              min={0}
              max={1000000}
            />
            <NumberField
              label={t("salaryDaily")}
              value={effective<number | null>("salary_daily", null)}
              onChange={(v) => setField("salary_daily", v)}
              min={0}
              max={50000}
            />
            <TextField
              label={t("salaryType")}
              value={effective<string | null>("salary_type", null) ?? ""}
              onChange={(v) => setField("salary_type", v)}
              placeholder={t("salaryTypePlaceholder")}
            />
            <TextField
              label={t("experienceRequired")}
              value={
                effective<string | null>("experience_required", null) ?? ""
              }
              onChange={(v) => setField("experience_required", v)}
            />
            <TextField
              label={t("employmentType")}
              value={effective<string | null>("employment_type", null) ?? ""}
              onChange={(v) => setField("employment_type", v)}
              placeholder={t("employmentTypePlaceholder")}
            />
            <TextField
              label={t("employmentSchedule")}
              value={
                effective<string | null>("employment_schedule", null) ?? ""
              }
              onChange={(v) => setField("employment_schedule", v)}
            />
            <TextField
              label={t("workSchedule")}
              value={effective<string | null>("work_schedule", null) ?? ""}
              onChange={(v) => setField("work_schedule", v)}
            />
            <TextField
              label={t("shiftSchedule")}
              value={effective<string | null>("schedule", null) ?? ""}
              onChange={(v) => setField("schedule", v)}
            />
          </Grid2>
          <TextAreaField
            label={t("requirements")}
            value={effective<string | null>("requirements", null) ?? ""}
            onChange={(v) => setField("requirements", v)}
            rows={3}
          />
        </Section>
      )}

      <Section title={t("extraInfo")}>
        <ListField
          label={t("languages")}
          value={effective<string[] | null>("languages", null) ?? []}
          onChange={(next) => setField("languages", next)}
        />
        <ListField
          label={t("equipment")}
          value={effective<string[] | null>("equipment", null) ?? []}
          onChange={(next) => setField("equipment", next)}
        />
      </Section>

      <Section title={t("photos")}>
        <PhotoUploader
          photos={effective<string[]>("photos", []) as string[]}
          onPhotosChange={(next) => setField("photos", next)}
          maxPhotos={20}
        />
      </Section>

      <Section title={t("statusVisibility")} defaultOpen>
        <Grid3>
          <SelectField
            label={t("status")}
            value={effective<string | null>("status", null) ?? "pending"}
            onChange={(v) => setField("status", v)}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: tOpts(`listingStatuses.${s}`),
            }))}
          />
          <ToggleField
            label="VIP"
            value={effective<boolean | null>("is_vip", null) === true}
            onChange={(v) => setField("is_vip", v)}
          />
          <ToggleField
            label={t("newBadge")}
            value={effective<boolean | null>("is_new", null) === true}
            onChange={(v) => setField("is_new", v)}
          />
        </Grid3>
        <TextAreaField
          label={t("adminComment")}
          value={effective<string | null>("admin_notes", null) ?? ""}
          onChange={(v) => setField("admin_notes", v)}
          rows={3}
          placeholder={t("adminCommentPlaceholder")}
        />
      </Section>
    </div>
  );
}

// ---------- Action bar ----------

function ActionBar({
  busy,
  isDirty,
  disabled,
  onSave,
  onApprove,
  onReject,
}: {
  busy: null | "save" | "approve" | "reject";
  isDirty: boolean;
  disabled: boolean;
  onSave: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const t = useTranslations("AdminShared.listingAudit");
  const tShared = useTranslations("AdminShared");
  const tDash = useTranslations("DashboardShared");

  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white/95 px-6 py-4 backdrop-blur">
      <p className="text-[12px] font-bold text-[#64748B]">
        {isDirty ? t("unsavedChanges") : t("noChanges")}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || busy != null}
          className="inline-flex h-12 min-h-[44px] items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-5 text-sm font-bold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {tDash("save")}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="inline-flex h-12 min-h-[44px] items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-5 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
        >
          {busy === "reject" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          {t("reject")}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="inline-flex h-12 min-h-[44px] items-center gap-2 rounded-xl bg-[#059669] px-6 text-sm font-bold text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
        >
          {busy === "approve" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {tShared("approve")}
        </button>
      </div>
    </div>
  );
}

// ---------- Layout primitives ----------

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-[#E2E8F0] bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14px] font-extrabold uppercase tracking-[0.6px] text-[#0F172A]">
        {title}
        <span className="text-[#94A3B8] transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-[#F1F5F9] px-5 py-5">
        {children}
      </div>
    </details>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function Grid3({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

function RowLine({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-[14px] font-semibold text-[#0F172A]">
        {children}
      </dd>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none";

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
        {required && <span className="ml-1 text-[#DC2626]">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
  min,
  max,
  integer,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: string;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(null);
          const n = Number(v);
          onChange(Number.isFinite(n) ? n : null);
        }}
        onBlur={() => {
          if (value === null) return;
          const clamped = clampNumber(value, { min, max, integer });
          if (clamped !== value) onChange(clamped);
        }}
        className={inputClass}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${inputClass} resize-y`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex h-full flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors ${
        value
          ? "border-[#2563EB] bg-[#EFF6FF]"
          : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-[#0F172A]">{label}</span>
        <span
          className={`inline-flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
            value ? "bg-[#2563EB]" : "bg-[#CBD5E1]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </div>
      {help && <span className="text-[11px] text-[#64748B]">{help}</span>}
    </button>
  );
}

function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const tDash = useTranslations("DashboardShared");

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
      <span className="text-[13px] font-bold text-[#0F172A]">{label}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-lg px-3 py-1 text-[12px] font-bold ${
            value === true
              ? "bg-[#059669] text-white"
              : "bg-[#F1F5F9] text-[#475569]"
          }`}
        >
          {tDash("yes")}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-lg px-3 py-1 text-[12px] font-bold ${
            value === false
              ? "bg-[#DC2626] text-white"
              : "bg-[#F1F5F9] text-[#475569]"
          }`}
        >
          {tDash("no")}
        </button>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const display = value ? value.slice(0, 10) : "";
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <SharedDateField
        value={display}
        onChange={(v) => onChange(v || null)}
        clearable
        className="h-[42px]"
      />
    </label>
  );
}

function ChipsField({
  group,
  options,
  selected,
  onChange,
}: {
  group: OptionGroup;
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = chipIsActive(group, selected, opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(chipToggle(group, selected, opt.key))}
            className={`rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
              active
                ? "border-[#2563EB] bg-[#2563EB] text-white"
                : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AmenityChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const tOpts = useTranslations("ListingOptions");

  return (
    <div className="space-y-3">
      {AMENITY_GROUP_KEYS.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {tOpts(`amenityGroupLabels.${group.key}`)}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((key) => {
              const active = chipIsActive("amenities", selected, key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onChange(chipToggle("amenities", selected, key))
                  }
                  className={`rounded-full border px-3 py-1 text-[12px] font-bold transition-colors ${
                    active
                      ? "border-[#2563EB] bg-[#2563EB] text-white"
                      : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"
                  }`}
                >
                  {tOpts(`amenities.${key}`)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("AdminShared.listingAudit");
  const tDash = useTranslations("DashboardShared");
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (value.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...value, v]);
    setDraft("");
  }

  return (
    <div>
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <div className="mb-2 flex flex-wrap gap-2">
        {value.length === 0 && (
          <span className="text-[12px] text-[#94A3B8]">{tDash("empty")}</span>
        )}
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-[12px] font-semibold text-[#0F172A]"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="text-[#94A3B8] hover:text-[#DC2626]"
              aria-label={t("removeItem", { value: v })}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("addItemPlaceholder")}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-[#2563EB] bg-[#EFF6FF] px-4 text-[12px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
        >
          {tDash("add")}
        </button>
      </div>
    </div>
  );
}
