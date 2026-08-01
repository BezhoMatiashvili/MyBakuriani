"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import NumberField from "@/components/shared/NumberField";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { isValidGePhone } from "@/lib/utils/number";
import { scrollToField } from "@/lib/forms/scroll-to-error";
import { cn } from "@/lib/utils";
import {
  contentChangeErrorKey,
  isContentChangeError,
  submitContentChange,
} from "@/lib/content-change/client";
import {
  VEHICLE_MAKES,
  dbOptionsFor,
  parseRoutePricing,
} from "@/lib/constants/listing-options";

const TRANSPORT_TYPES = [
  { value: "minivan" },
  { value: "taxi" },
  { value: "microbus" },
  { value: "other" },
] as const;

// Price units offered per route row (each route can price differently).
const ROUTE_PRICE_UNITS = [
  { value: "one_way" },
  { value: "round_trip" },
  { value: "on_demand" },
  { value: "whole_car" },
  { value: "per_person" },
] as const;

// One editable route+price row in the form (price held as string for input).
type RouteRow = {
  route: string;
  subtitle: string;
  price: string;
  unit: string;
};

const emptyRouteRow = (): RouteRow => ({
  route: "",
  subtitle: "",
  price: "",
  unit: "one_way",
});

const LANGUAGE_OPTIONS = [
  { value: "ქართული", key: "ka" },
  { value: "English", key: "en" },
  { value: "Русский", key: "ru" },
] as const;

// DB-stored Georgian payload values + message keys (see listing-options.ts).
const ROUTE_OPTIONS = dbOptionsFor("transportRoutes");
const EQUIPMENT_OPTIONS = dbOptionsFor("vehicleEquipment");
const FEATURE_OPTIONS = dbOptionsFor("transportFeatures");

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 10;

function TransportLoading() {
  const tShared = useTranslations("CreateShared");
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-[#64748B]">
      {tShared("loading")}
    </div>
  );
}

export default function CreateTransportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateTransportPageInner />
    </Suspense>
  );
}

function CreateTransportPageInner() {
  const t = useTranslations("CreateTransport");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const tService = useTranslations("CreateService");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = createClient();

  const transportTypeOptions = useMemo(
    () =>
      TRANSPORT_TYPES.map((o) => ({
        value: o.value,
        label: tOpts(`transportTypes.${o.value}`),
      })),
    [tOpts],
  );

  const routeOptions = useMemo(
    () =>
      ROUTE_OPTIONS.map((r) => ({
        value: r.value,
        label: tOpts(`transportRoutes.${r.key}`),
      })),
    [tOpts],
  );

  const routeUnitOptions = useMemo(
    () =>
      ROUTE_PRICE_UNITS.map((o) => ({
        value: o.value,
        label: tOpts(`priceUnits.${o.value}`),
      })),
    [tOpts],
  );

  const vehicleColorOptions = useMemo(
    () =>
      dbOptionsFor("vehicleColors").map((c) => ({
        value: c.value,
        label: tOpts(`vehicleColors.${c.key}`),
      })),
    [tOpts],
  );

  const vehicleMakeOptions = useMemo(
    () =>
      VEHICLE_MAKES.map((m) =>
        m.value === "სხვა" ? { ...m, label: tOpts("other") } : m,
      ),
    [tOpts],
  );

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);

  const [driverName, setDriverName] = useState("");
  const [vehicleMake, setVehicleMake] = useState("Mercedes-Benz");
  const [transportType, setTransportType] =
    useState<(typeof TRANSPORT_TYPES)[number]["value"]>("minivan");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [routeRows, setRouteRows] = useState<RouteRow[]>([emptyRouteRow()]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!editId || !user) return;
    let cancelled = false;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from("services")
        .select("*")
        .eq("id", editId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(tShared("listingNotFound"));
        setHydrating(false);
        return;
      }

      const toStringArray = (v: unknown): string[] =>
        Array.isArray(v)
          ? v.filter((x): x is string => typeof x === "string")
          : [];
      const stripPrefix = (v: string | null) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";

      setDriverName(data.driver_name ?? data.title ?? "");
      setVehicleMake(data.vehicle_make ?? "Mercedes-Benz");
      setTransportType(
        (data.transport_type ??
          "minivan") as (typeof TRANSPORT_TYPES)[number]["value"],
      );
      setVehicleCapacity(
        data.vehicle_capacity != null ? String(data.vehicle_capacity) : "",
      );
      setVehicleColor(data.vehicle_color ?? "");
      const parsedRows = parseRoutePricing(data.route_pricing);
      if (parsedRows.length > 0) {
        setRouteRows(
          parsedRows.map((r) => ({
            route: r.route,
            subtitle: r.subtitle ?? "",
            price: String(r.price),
            unit: r.unit,
          })),
        );
      } else {
        // Legacy listing: one row per shared route, all at the single price.
        const legacyRoutes = toStringArray(data.routes);
        const legacyPrice = data.price != null ? String(data.price) : "";
        const legacyUnit = data.price_unit ?? "one_way";
        setRouteRows(
          legacyRoutes.length > 0
            ? legacyRoutes.map((route) => ({
                route,
                subtitle: "",
                price: legacyPrice,
                unit: legacyUnit,
              }))
            : [emptyRouteRow()],
        );
      }
      setEquipment(toStringArray(data.equipment));
      setFeatures(toStringArray(data.features));
      setLanguages(toStringArray(data.languages));
      setDescription(data.description ?? "");
      setPhone(stripPrefix(data.phone));
      setWhatsapp(
        stripPrefix((data as { whatsapp?: string | null }).whatsapp ?? null),
      );
      setPhotos(toStringArray(data.photos));

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase, tShared]);

  function toggle(arr: string[], value: string): string[] {
    return arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
  }

  function updateRouteRow(index: number, patch: Partial<RouteRow>) {
    setRouteRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function addRouteRow() {
    setRouteRows((rows) => [...rows, emptyRouteRow()]);
  }

  function removeRouteRow(index: number) {
    setRouteRows((rows) => rows.filter((_, i) => i !== index));
  }

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!driverName.trim())
      errs.push({ key: "driverName", message: t("enterDriverName") });
    if (!vehicleCapacity)
      errs.push({ key: "vehicleCapacity", message: t("enterCapacity") });
    if (routeRows.every((r) => !r.route))
      errs.push({ key: "routes", message: t("chooseRoute") });
    else if (routeRows.some((r) => r.route && !(Number(r.price) > 0)))
      errs.push({ key: "routes", message: t("enterPrice") });
    if (photos.length < MIN_PHOTOS)
      errs.push({ key: "photos", message: tShared("uploadMinOnePhoto") });
    if (!phone.trim())
      errs.push({ key: "phone", message: tShared("enterPhone") });
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
      if (!isValidGePhone(phone)) throw new Error(tShared("enterPhone"));

      const cleanedRows = routeRows
        .filter((r) => r.route && Number(r.price) > 0)
        .map((r) => ({
          route: r.route,
          subtitle: r.subtitle.trim() || null,
          price: Number(r.price),
          unit: r.unit,
        }));
      // Keep the legacy single-price fields in sync for cards, the /transport
      // route filter, and the detail-page fallback: `price` is the cheapest
      // route ("from" price), `routes` the selected route values.
      const cheapestRow = cleanedRows.reduce((min, r) =>
        r.price < min.price ? r : min,
      );

      const payload = {
        title: driverName.trim(),
        description: description.trim() || null,
        driver_name: driverName.trim(),
        vehicle_make: vehicleMake,
        transport_type: transportType,
        vehicle_capacity: Number(vehicleCapacity),
        vehicle_color: vehicleColor || null,
        routes: cleanedRows.map((r) => r.route),
        route_pricing: cleanedRows,
        price: cheapestRow.price,
        price_unit: cheapestRow.unit,
        equipment,
        features,
        languages,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        photos,
      };

      if (editId) {
        await submitContentChange("service", editId, payload);
        router.push("/dashboard/transport");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
          category: "transport",
          status: "pending",
        });

        if (insertError) throw insertError;
        router.push("/dashboard/transport");
      }
    } catch (err) {
      setError(
        isContentChangeError(err)
          ? tShared(contentChangeErrorKey(err))
          : formatSupabaseError(err, tShared("genericError")),
      );
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const requiredFilled = [
    driverName.trim().length > 0,
    vehicleCapacity.length > 0,
    routeRows.some((r) => r.route),
    routeRows.some((r) => Number(r.price) > 0),
    photos.length >= MIN_PHOTOS,
    isValidGePhone(phone),
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 6) * 100));

  return (
    <WizardShell
      mobileDensity="compact"
      title={t("pageTitle")}
      accent="blue"
      progressPercent={progressPercent}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          submitLabel={isEditMode ? tShared("contentChange.submitForReview") : tShared("publishListing")}
          submitDisabled={loading}
          loading={loading}
          error={error}
        />
      }
    >
      {hydrating ? (
        <TransportLoading />
      ) : (
        <div className="space-y-8">
          <WizardInnerCard
            number={1}
            title={tShared("basicInfo")}
            accent="blue"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={t("driverName")}
                required
                fieldKey="driverName"
                error={invalidFields.has("driverName")}
              >
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder={t("driverPlaceholder")}
                  className={inputClass}
                />
              </Field>
              <Field label={t("vehicleMake")} required>
                <SearchableSelect
                  value={vehicleMake}
                  onValueChange={setVehicleMake}
                  options={vehicleMakeOptions}
                  accent="blue"
                  placeholder={t("chooseMake")}
                  searchPlaceholder={t("searchMake")}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label={t("transportType")} required>
                <StyledSelect
                  value={transportType}
                  onValueChange={setTransportType}
                  options={transportTypeOptions}
                  accent="blue"
                />
              </Field>
              <Field
                label={t("vehicleCapacity")}
                required
                fieldKey="vehicleCapacity"
                error={invalidFields.has("vehicleCapacity")}
                labelOnlyError
              >
                <NumberField
                  value={vehicleCapacity}
                  onChange={setVehicleCapacity}
                  min={1}
                  max={50}
                  integer
                  stepper
                  placeholder="8"
                  accent="blue"
                  error={invalidFields.has("vehicleCapacity")}
                />
              </Field>
            </div>

            <Field label={t("vehicleColor")}>
              <StyledSelect
                value={vehicleColor}
                onValueChange={setVehicleColor}
                options={vehicleColorOptions}
                accent="blue"
                placeholder={t("chooseColor")}
              />
            </Field>

            <Field label={tShared("description")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={4}
                className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
              />
            </Field>
          </WizardInnerCard>

          <WizardInnerCard
            number={2}
            title={t("sectionRoutePrice")}
            accent="blue"
          >
            <div data-field="routes" className="scroll-mt-24 space-y-4">
              {routeRows.map((row, i) => (
                <div
                  key={i}
                  className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#334155]">
                      {t("mainRoutes")}
                      {routeRows.length > 1 ? ` #${i + 1}` : ""}
                    </span>
                    {routeRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRouteRow(i)}
                        className="text-[12px] font-semibold text-[#EF4444] hover:underline"
                      >
                        {t("removeRoute")}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={t("mainRoutes")} required>
                      <StyledSelect
                        value={row.route}
                        onValueChange={(v) => updateRouteRow(i, { route: v })}
                        options={routeOptions}
                        accent="blue"
                        placeholder={t("chooseRoute")}
                      />
                    </Field>
                    <Field label={t("routeSubtitle")}>
                      <input
                        type="text"
                        value={row.subtitle}
                        onChange={(e) =>
                          updateRouteRow(i, { subtitle: e.target.value })
                        }
                        placeholder={t("routeSubtitlePlaceholder")}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={t("routePrice")} required>
                      <NumberField
                        value={row.price}
                        onChange={(v) => updateRouteRow(i, { price: v })}
                        min={0}
                        max={100000}
                        integer
                        placeholder="250"
                        suffix="₾"
                        accent="blue"
                      />
                    </Field>
                    <Field label={t("priceUnit")} required>
                      <StyledSelect
                        value={row.unit}
                        onValueChange={(v) => updateRouteRow(i, { unit: v })}
                        options={routeUnitOptions}
                        accent="blue"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRouteRow}
                className="inline-flex h-10 min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-[#CBD5E1] px-4 text-[13px] font-semibold text-[#2563EB] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF] lg:min-h-0"
              >
                <Plus className="h-4 w-4" />
                {t("addRoute")}
              </button>
            </div>
          </WizardInnerCard>

          <WizardInnerCard
            number={3}
            title={t("sectionEquipment")}
            accent="blue"
          >
            <Field label={t("vehicleEquipment")}>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((e) => (
                  <Chip
                    key={e.value}
                    active={equipment.includes(e.value)}
                    onClick={() => setEquipment(toggle(equipment, e.value))}
                  >
                    {tOpts(`vehicleEquipment.${e.key}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={t("comfortAndServices")}>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((f) => (
                  <Chip
                    key={f.value}
                    active={features.includes(f.value)}
                    onClick={() => setFeatures(toggle(features, f.value))}
                  >
                    {tOpts(`transportFeatures.${f.key}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={tService("spokenLanguages")}>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((l) => (
                  <Chip
                    key={l.value}
                    active={languages.includes(l.value)}
                    onClick={() => setLanguages(toggle(languages, l.value))}
                  >
                    {tOpts(`languages.${l.key}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field
              label={t("vehiclePhotos")}
              required
              fieldKey="photos"
              error={invalidFields.has("photos")}
              labelOnlyError
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
            number={4}
            title={tShared("contactInfo")}
            accent="blue"
          >
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
                      ? tShared("enterPhone")
                      : phone && !isValidGePhone(phone)
                        ? tShared("invalidPhone")
                        : null
                  }
                />
              </Field>
              <Field label={tShared("whatsappNumber")}>
                <PhoneInput
                  value={whatsapp}
                  onChange={setWhatsapp}
                  error={
                    whatsapp && !isValidGePhone(whatsapp)
                      ? tShared("invalidPhone")
                      : null
                  }
                />
              </Field>
            </div>
            <p className="text-xs font-medium text-[#94A3B8]">
              {tShared("whatsappOptional")}
            </p>
          </WizardInnerCard>
        </div>
      )}
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

function Field({
  label,
  required,
  fieldKey,
  error,
  labelOnlyError,
  children,
}: {
  label: string;
  required?: boolean;
  fieldKey?: string;
  error?: boolean;
  /** Only redden the label (for controls whose own buttons shouldn't turn red). */
  labelOnlyError?: boolean;
  children: React.ReactNode;
}) {
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
      <label
        className={cn(
          "text-[13px] font-bold",
          error ? "text-[#EF4444]" : "text-[#334155]",
        )}
      >
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({
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
      className={`h-9 rounded-[10px] border px-3 text-sm transition-colors ${
        active
          ? "border-[#2563EB] bg-[#2563EB] font-semibold text-white"
          : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
      }`}
    >
      {children}
    </button>
  );
}
