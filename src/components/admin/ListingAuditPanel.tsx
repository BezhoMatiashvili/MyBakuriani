"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
import { SkierLoader } from "@/components/shared/SkierLoader";
import {
  AMENITY_GROUPS,
  HOSTING_LANGS,
  LISTING_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  SERVICE_CATEGORY_LABELS,
} from "@/lib/constants/listing-options";
import { formatPhone } from "@/lib/utils/format";
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
];

const SERVICE_CATEGORY_OPTIONS: Enums<"service_category">[] = [
  "food",
  "transport",
  "entertainment",
  "employment",
  "handyman",
  "cleaning",
];

const CONSTRUCTION_STATUS_OPTIONS = [
  { value: "ready", label: "მზად ჩასახლებისთვის" },
  { value: "under_construction", label: "მშენებარე" },
  { value: "planned", label: "დაგეგმილი" },
];

const RENOVATION_STATUS_OPTIONS = [
  { value: "new_renovation", label: "ახალი რემონტი" },
  { value: "old_renovation", label: "ძველი რემონტი" },
  { value: "black_frame", label: "შავი კარკასი" },
  { value: "white_frame", label: "თეთრი კარკასი" },
  { value: "green_frame", label: "მწვანე კარკასი" },
];

const ROOM_TYPE_OPTIONS = [
  { value: "studio", label: "სტუდიო" },
  { value: "1_bedroom", label: "1 საძინებელი" },
  { value: "2_bedroom", label: "2 საძინებელი" },
  { value: "3_bedroom", label: "3 საძინებელი" },
  { value: "4_plus_bedroom", label: "4+ საძინებელი" },
];

export default function ListingAuditPanel({
  kind,
  id,
  onModerated,
  onChange,
}: Props) {
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
        if (!res.ok) throw new Error(payload.error ?? "დეტალები ვერ ჩაიტვირთა");
        setData(payload as AuditPayload);
      } catch (err) {
        if (!active) return;
        setLoadErr(err instanceof Error ? err.message : "შეცდომა");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [kind, id, reloadToken]);

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
          : payload?.error || "შენახვა ვერ მოხერხდა",
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
      if (!res.ok) throw new Error(payload.error ?? "შეცდომა");
      toast.success(
        action === "approve" ? "განცხადება დამტკიცდა" : "განცხადება უარყოფილია",
      );
      onModerated?.(action);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
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
      toast.success(`შენახულია ${count} ცვლილება`);
      setDraft({});
      setReloadToken((n) => n + 1);
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
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

// ---------- Owner & NAPR ----------

function OwnerCard({ owner }: { owner: AuditPayload["owner"] }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#475569]">
        <UserIcon className="h-4 w-4" />
        მესაკუთრის ინფო
        {owner.is_verified && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
            <BadgeCheck className="h-3 w-3" />
            ვერიფიცირებული
          </span>
        )}
      </div>
      <dl className="space-y-3 text-sm">
        <RowLine icon={<UserIcon className="h-4 w-4" />} label="სახელი">
          {owner.display_name ?? "—"}
        </RowLine>
        <RowLine icon={<Phone className="h-4 w-4" />} label="ტელეფონი">
          {formatPhone(owner.phone)}
        </RowLine>
        <RowLine icon={<Mail className="h-4 w-4" />} label="ელ-ფოსტა">
          {owner.email ?? "—"}
        </RowLine>
        <RowLine
          icon={<ShieldCheck className="h-4 w-4" />}
          label="პირადი ნომერი"
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
  return (
    <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#1D4ED8]">
        <Building2 className="h-4 w-4" />
        იურიდიული (NAPR)
      </div>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold text-[#475569]">
            საკადასტრო კოდი
          </span>
          <input
            type="text"
            value={cadastralCode ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="00.00.0000.000"
            className="w-full rounded-xl border border-[#BFDBFE] bg-white px-3 py-2 font-mono text-[15px] font-bold text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
          />
        </label>
        <a
          href="https://napr.gov.ge/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1D4ED8] hover:underline"
        >
          napr.gov.ge შემოწმება
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

  return (
    <div className="space-y-4">
      <Section title="ძირითადი ინფო" defaultOpen>
        <Grid2>
          <TextField
            label="სათაური"
            required
            value={effective<string>("title", "")}
            onChange={(v) => setField("title", v)}
          />
          <SelectField
            label="ბინის ტიპი"
            value={effective<string>("type", listing.type)}
            onChange={(v) => setField("type", v)}
            options={PROPERTY_TYPE_OPTIONS.map((t) => ({
              value: t,
              label: PROPERTY_TYPE_LABELS[t] ?? t,
            }))}
          />
        </Grid2>
        <TextAreaField
          label="აღწერა"
          value={effective<string | null>("description", null) ?? ""}
          onChange={(v) => setField("description", v)}
          rows={5}
        />
        <Grid2>
          <ToggleField
            label="გასაყიდი ობიექტი"
            help="ჩართე თუ ეს არის გასაყიდი, არა გასაქირავებელი"
            value={isForSale}
            onChange={(v) => setField("is_for_sale", v)}
          />
        </Grid2>
      </Section>

      <Section title="მდებარეობა" defaultOpen>
        <TextField
          label="მისამართი"
          required
          value={effective<string>("location", "")}
          onChange={(v) => setField("location", v)}
        />
        <Grid2>
          <NumberField
            label="ფართობი (მ²)"
            value={effective<number | null>("area_sqm", null)}
            onChange={(v) => setField("area_sqm", v)}
            step="0.1"
          />
          <NumberField
            label="მანძილი ფერდამდე (მ)"
            value={effective<number | null>("distance_to_slope_m", null)}
            onChange={(v) => setField("distance_to_slope_m", v)}
          />
        </Grid2>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <p className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
            <MapPin className="h-4 w-4" />
            ზუსტი მდებარეობა
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

      <Section title="სპეციფიკაცია" defaultOpen>
        <Grid3>
          <NumberField
            label="ოთახი"
            value={effective<number | null>("rooms", null)}
            onChange={(v) => setField("rooms", v)}
          />
          <NumberField
            label="სველი წერტილი"
            value={effective<number | null>("bathrooms", null)}
            onChange={(v) => setField("bathrooms", v)}
          />
          <NumberField
            label="ტევადობა"
            value={effective<number | null>("capacity", null)}
            onChange={(v) => setField("capacity", v)}
          />
          <SelectField
            label="ოთახის ტიპი"
            value={effective<string | null>("room_type", null) ?? ""}
            onChange={(v) => setField("room_type", v || null)}
            options={[{ value: "", label: "—" }, ...ROOM_TYPE_OPTIONS]}
          />
          <NumberField
            label="ვარსკვლავი (სასტუმრო)"
            value={effective<number | null>("hotel_stars", null)}
            onChange={(v) => setField("hotel_stars", v)}
          />
          <NumberField
            label="მინ. ღამე"
            value={effective<number | null>("min_booking_days", null)}
            onChange={(v) => setField("min_booking_days", v)}
          />
        </Grid3>
      </Section>

      <Section title="ფასი">
        <Grid3>
          {!isForSale && (
            <NumberField
              label="ფასი / ღამე"
              value={effective<number | null>("price_per_night", null)}
              onChange={(v) => setField("price_per_night", v)}
              step="0.01"
            />
          )}
          {isForSale && (
            <NumberField
              label="გასაყიდი ფასი"
              value={effective<number | null>("sale_price", null)}
              onChange={(v) => setField("sale_price", v)}
              step="0.01"
            />
          )}
          <TextField
            label="ვალუტა"
            value={effective<string | null>("currency", null) ?? ""}
            onChange={(v) => setField("currency", v)}
            placeholder="₾"
          />
          <NumberField
            label="ფასდაკლება %"
            value={effective<number | null>("discount_percent", null)}
            onChange={(v) => setField("discount_percent", v)}
          />
          <NumberField
            label="დასუფთავების საფასური"
            value={effective<number | null>("cleaning_fee", null)}
            onChange={(v) => setField("cleaning_fee", v)}
            step="0.01"
          />
          <NumberField
            label="ROI %"
            value={effective<number | null>("roi_percent", null)}
            onChange={(v) => setField("roi_percent", v)}
            step="0.1"
          />
        </Grid3>
      </Section>

      <Section title="კეთილმოწყობა და წესები">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
          კეთილმოწყობა
        </p>
        <AmenityChips
          selected={effective<string[]>("amenities", []) as string[]}
          onChange={(next) => setField("amenities", next)}
        />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.6px] text-[#475569]">
              მასპინძლის ენები
            </p>
            <ChipsField
              options={HOSTING_LANGS}
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
              სახლის წესები
            </p>
            <div className="flex flex-col gap-2">
              <TriState
                label="მოწევა დაშვებულია"
                value={smoking}
                onChange={(v) => updateRule({ smoking: v })}
              />
              <TriState
                label="ცხოველები დაშვებულია"
                value={pets}
                onChange={(v) => updateRule({ pets: v })}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="ფოტოები">
        <PhotoUploader
          photos={effective<string[]>("photos", []) as string[]}
          onPhotosChange={(next) => setField("photos", next)}
          maxPhotos={20}
        />
      </Section>

      <Section title="სტატუსი და ხილვადობა" defaultOpen>
        <Grid3>
          <SelectField
            label="სტატუსი"
            value={effective<string | null>("status", null) ?? "pending"}
            onChange={(v) => setField("status", v)}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: LISTING_STATUS_LABELS[s] ?? s,
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
            label="B2B პარტნიორი"
            value={effective<boolean | null>("is_b2b_partner", null) === true}
            onChange={(v) => setField("is_b2b_partner", v)}
          />
          <DateField
            label="VIP ვადა"
            value={effective<string | null>("vip_expires_at", null)}
            onChange={(v) => setField("vip_expires_at", v)}
          />
        </Grid3>
        <TextAreaField
          label="ადმინისტრატორის კომენტარი"
          value={effective<string | null>("admin_notes", null) ?? ""}
          onChange={(v) => setField("admin_notes", v)}
          rows={3}
          placeholder="დაამატე შენიშვნა (გამოგზავნდება მესაკუთრეს დადასტურების/უარყოფის შემთხვევაში)"
        />
      </Section>

      {isForSale && (
        <Section title="მშენებლობის სტატუსი">
          <Grid3>
            <SelectField
              label="მშენებლობის სტატუსი"
              value={
                effective<string | null>("construction_status", null) ?? ""
              }
              onChange={(v) => setField("construction_status", v || null)}
              options={[
                { value: "", label: "—" },
                ...CONSTRUCTION_STATUS_OPTIONS,
              ]}
            />
            <NumberField
              label="პროგრესი %"
              value={effective<number | null>(
                "construction_progress_percent",
                null,
              )}
              onChange={(v) => setField("construction_progress_percent", v)}
            />
            <NumberField
              label="დასრულების წელი"
              value={effective<number | null>("completion_year", null)}
              onChange={(v) => setField("completion_year", v)}
            />
            <TextField
              label="დეველოპერი"
              value={effective<string | null>("developer", null) ?? ""}
              onChange={(v) => setField("developer", v)}
            />
            <SelectField
              label="რემონტის სტატუსი"
              value={effective<string | null>("renovation_status", null) ?? ""}
              onChange={(v) => setField("renovation_status", v || null)}
              options={[
                { value: "", label: "—" },
                ...RENOVATION_STATUS_OPTIONS,
              ]}
            />
          </Grid3>
          <TextAreaField
            label="პროგრესის შენიშვნა"
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
  const category = effective<Enums<"service_category">>(
    "category",
    listing.category,
  );
  const isFood = category === "food";
  const isTransport = category === "transport";
  const isEmployment = category === "employment";

  return (
    <div className="space-y-4">
      <Section title="ძირითადი ინფო" defaultOpen>
        <Grid2>
          <TextField
            label="სათაური"
            required
            value={effective<string>("title", "")}
            onChange={(v) => setField("title", v)}
          />
          <SelectField
            label="კატეგორია"
            value={category}
            onChange={(v) => setField("category", v)}
            options={SERVICE_CATEGORY_OPTIONS.map((c) => ({
              value: c,
              label: SERVICE_CATEGORY_LABELS[c] ?? c,
            }))}
          />
        </Grid2>
        <TextAreaField
          label="აღწერა"
          value={effective<string | null>("description", null) ?? ""}
          onChange={(v) => setField("description", v)}
          rows={5}
        />
      </Section>

      <Section title="კონტაქტი და მდებარეობა" defaultOpen>
        <Grid2>
          <TextField
            label="მისამართი"
            value={effective<string | null>("location", null) ?? ""}
            onChange={(v) => setField("location", v)}
          />
          <TextField
            label="ტელეფონი"
            value={effective<string | null>("phone", null) ?? ""}
            onChange={(v) => setField("phone", v)}
            placeholder="+995 5XX XX XX XX"
          />
        </Grid2>
      </Section>

      <Section title="ფასი">
        <Grid3>
          <NumberField
            label="ფასი"
            value={effective<number | null>("price", null)}
            onChange={(v) => setField("price", v)}
            step="0.01"
          />
          <TextField
            label="ფასის ერთეული"
            value={effective<string | null>("price_unit", null) ?? ""}
            onChange={(v) => setField("price_unit", v)}
            placeholder="საათი, ადამიანი, კმ..."
          />
          <TextField
            label="ვალუტა"
            value={effective<string | null>("currency", null) ?? ""}
            onChange={(v) => setField("currency", v)}
            placeholder="₾"
          />
          <NumberField
            label="ფასდაკლება %"
            value={effective<number | null>("discount_percent", null)}
            onChange={(v) => setField("discount_percent", v)}
          />
        </Grid3>
      </Section>

      {isFood && (
        <Section title="კვების სპეციფიკაცია" defaultOpen>
          <Grid2>
            <TextField
              label="სამზარეულოს ტიპი"
              value={effective<string | null>("cuisine_type", null) ?? ""}
              onChange={(v) => setField("cuisine_type", v)}
            />
            <TextField
              label="საშუალო ჩეკი"
              value={effective<string | null>("avg_check", null) ?? ""}
              onChange={(v) => setField("avg_check", v)}
            />
            <TextField
              label="სამუშაო საათები"
              value={effective<string | null>("operating_hours", null) ?? ""}
              onChange={(v) => setField("operating_hours", v)}
            />
            <TextField
              label="მენიუს URL"
              value={effective<string | null>("menu_url", null) ?? ""}
              onChange={(v) => setField("menu_url", v)}
            />
            <TextField
              label="საცხოვრებელი"
              value={effective<string | null>("accommodation", null) ?? ""}
              onChange={(v) => setField("accommodation", v)}
            />
            <TextField
              label="კერძები"
              value={effective<string | null>("meals", null) ?? ""}
              onChange={(v) => setField("meals", v)}
            />
          </Grid2>
          <Grid2>
            <ToggleField
              label="მიტანის სერვისი"
              value={effective<boolean | null>("has_delivery", null) === true}
              onChange={(v) => setField("has_delivery", v)}
            />
            <ToggleField
              label="ბავშვთა სივრცე"
              value={effective<boolean | null>("has_kids_area", null) === true}
              onChange={(v) => setField("has_kids_area", v)}
            />
            <ToggleField
              label="ცოცხალი მუსიკა"
              value={effective<boolean | null>("has_live_music", null) === true}
              onChange={(v) => setField("has_live_music", v)}
            />
            <ToggleField
              label="ლაუნჯი"
              value={effective<boolean | null>("has_lounge", null) === true}
              onChange={(v) => setField("has_lounge", v)}
            />
          </Grid2>
        </Section>
      )}

      {isTransport && (
        <Section title="ტრანსპორტის სპეციფიკაცია" defaultOpen>
          <Grid2>
            <TextField
              label="მძღოლის სახელი"
              value={effective<string | null>("driver_name", null) ?? ""}
              onChange={(v) => setField("driver_name", v)}
            />
            <TextField
              label="ავტომობილი"
              value={effective<string | null>("vehicle_make", null) ?? ""}
              onChange={(v) => setField("vehicle_make", v)}
            />
            <NumberField
              label="ადგილების რაოდენობა"
              value={effective<number | null>("vehicle_capacity", null)}
              onChange={(v) => setField("vehicle_capacity", v)}
            />
            <TextField
              label="ტრანსპორტის ტიპი"
              value={effective<string | null>("transport_type", null) ?? ""}
              onChange={(v) => setField("transport_type", v)}
            />
            <TextField
              label="ძირითადი მარშრუტი"
              value={effective<string | null>("route", null) ?? ""}
              onChange={(v) => setField("route", v)}
            />
          </Grid2>
          <ListField
            label="დამატებითი მარშრუტები"
            value={effective<string[] | null>("routes", null) ?? []}
            onChange={(next) => setField("routes", next)}
          />
        </Section>
      )}

      {isEmployment && (
        <Section title="დასაქმების სპეციფიკაცია" defaultOpen>
          <Grid2>
            <TextField
              label="პოზიცია"
              value={effective<string | null>("position", null) ?? ""}
              onChange={(v) => setField("position", v)}
            />
            <TextField
              label="ანაზღაურების დიაპაზონი"
              value={effective<string | null>("salary_range", null) ?? ""}
              onChange={(v) => setField("salary_range", v)}
              placeholder="500-1000"
            />
            <NumberField
              label="ანაზღაურება (მინ)"
              value={effective<number | null>("salary_min", null)}
              onChange={(v) => setField("salary_min", v)}
            />
            <NumberField
              label="ანაზღაურება (მაქს)"
              value={effective<number | null>("salary_max", null)}
              onChange={(v) => setField("salary_max", v)}
            />
            <NumberField
              label="დღიური ანაზღაურება"
              value={effective<number | null>("salary_daily", null)}
              onChange={(v) => setField("salary_daily", v)}
            />
            <TextField
              label="ანაზღაურების ტიპი"
              value={effective<string | null>("salary_type", null) ?? ""}
              onChange={(v) => setField("salary_type", v)}
              placeholder="monthly / daily / hourly"
            />
            <TextField
              label="გამოცდილების მოთხოვნა"
              value={
                effective<string | null>("experience_required", null) ?? ""
              }
              onChange={(v) => setField("experience_required", v)}
            />
            <TextField
              label="დასაქმების ტიპი"
              value={effective<string | null>("employment_type", null) ?? ""}
              onChange={(v) => setField("employment_type", v)}
              placeholder="full-time / part-time"
            />
            <TextField
              label="დასაქმების გრაფიკი"
              value={
                effective<string | null>("employment_schedule", null) ?? ""
              }
              onChange={(v) => setField("employment_schedule", v)}
            />
            <TextField
              label="სამუშაო გრაფიკი"
              value={effective<string | null>("work_schedule", null) ?? ""}
              onChange={(v) => setField("work_schedule", v)}
            />
            <TextField
              label="ცვლა / ცხრილი"
              value={effective<string | null>("schedule", null) ?? ""}
              onChange={(v) => setField("schedule", v)}
            />
          </Grid2>
          <TextAreaField
            label="მოთხოვნები"
            value={effective<string | null>("requirements", null) ?? ""}
            onChange={(v) => setField("requirements", v)}
            rows={3}
          />
        </Section>
      )}

      <Section title="დამატებითი ინფო">
        <ListField
          label="ენები"
          value={effective<string[] | null>("languages", null) ?? []}
          onChange={(next) => setField("languages", next)}
        />
        <ListField
          label="აღჭურვილობა"
          value={effective<string[] | null>("equipment", null) ?? []}
          onChange={(next) => setField("equipment", next)}
        />
      </Section>

      <Section title="ფოტოები">
        <PhotoUploader
          photos={effective<string[]>("photos", []) as string[]}
          onPhotosChange={(next) => setField("photos", next)}
          maxPhotos={20}
        />
      </Section>

      <Section title="სტატუსი და ხილვადობა" defaultOpen>
        <Grid3>
          <SelectField
            label="სტატუსი"
            value={effective<string | null>("status", null) ?? "pending"}
            onChange={(v) => setField("status", v)}
            options={STATUS_OPTIONS.map((s) => ({
              value: s,
              label: LISTING_STATUS_LABELS[s] ?? s,
            }))}
          />
          <ToggleField
            label="VIP"
            value={effective<boolean | null>("is_vip", null) === true}
            onChange={(v) => setField("is_vip", v)}
          />
          <ToggleField
            label="„ახალი“ ნიშანი"
            value={effective<boolean | null>("is_new", null) === true}
            onChange={(v) => setField("is_new", v)}
          />
        </Grid3>
        <TextAreaField
          label="ადმინისტრატორის კომენტარი"
          value={effective<string | null>("admin_notes", null) ?? ""}
          onChange={(v) => setField("admin_notes", v)}
          rows={3}
          placeholder="დაამატე შენიშვნა (გამოგზავნდება მესაკუთრეს დადასტურების/უარყოფის შემთხვევაში)"
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
  return (
    <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white/95 px-6 py-4 backdrop-blur">
      <p className="text-[12px] font-bold text-[#64748B]">
        {isDirty ? "გაქვს შეუნახავი ცვლილებები" : "ცვლილებები არ არის"}
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
          შენახვა
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
          ვარყოფ
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
          დადასტურება
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
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-[#475569]">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(null);
          const n = Number(v);
          onChange(Number.isFinite(n) ? n : null);
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
          კი
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
          არა
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
      <input
        type="date"
        value={display}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputClass}
      />
    </label>
  );
}

function ChipsField({
  options,
  selected,
  onChange,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => toggle(opt.key)}
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
  function toggle(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }
  return (
    <div className="space-y-3">
      {AMENITY_GROUPS.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.options.map((opt) => {
              const active = selected.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggle(opt.key)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-bold transition-colors ${
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
          <span className="text-[12px] text-[#94A3B8]">ცარიელია</span>
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
              aria-label={`წაშლა: ${v}`}
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
          placeholder="დაამატე ერთეული და დააჭირე Enter"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-[#2563EB] bg-[#EFF6FF] px-4 text-[12px] font-bold text-[#1D4ED8] hover:bg-[#DBEAFE]"
        >
          დამატება
        </button>
      </div>
    </div>
  );
}
