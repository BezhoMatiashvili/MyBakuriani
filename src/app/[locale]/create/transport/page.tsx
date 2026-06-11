"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { VEHICLE_MAKES, dbOptionsFor } from "@/lib/constants/listing-options";

const TRANSPORT_TYPES = [
  { value: "minivan" },
  { value: "taxi" },
  { value: "microbus" },
  { value: "other" },
] as const;

const PRICE_UNITS = [
  { value: "whole_car" },
  { value: "on_demand" },
  { value: "per_person" },
] as const;

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

  const priceUnitOptions = useMemo(
    () =>
      PRICE_UNITS.map((o) => ({
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
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(isEditMode);

  const [driverName, setDriverName] = useState("");
  const [vehicleMake, setVehicleMake] = useState("Mercedes-Benz");
  const [transportType, setTransportType] =
    useState<(typeof TRANSPORT_TYPES)[number]["value"]>("minivan");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [routes, setRoutes] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] =
    useState<(typeof PRICE_UNITS)[number]["value"]>("whole_car");
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
      setRoutes(toStringArray(data.routes));
      setPrice(data.price != null ? String(data.price) : "");
      setPriceUnit(
        (data.price_unit ??
          "whole_car") as (typeof PRICE_UNITS)[number]["value"],
      );
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

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      if (!driverName.trim()) throw new Error(t("enterDriverName"));
      if (!vehicleCapacity) throw new Error(t("enterCapacity"));
      if (routes.length === 0) throw new Error(t("chooseRoute"));
      if (!price) throw new Error(t("enterPrice"));
      if (!phone.trim()) throw new Error(tShared("enterPhone"));
      if (photos.length < MIN_PHOTOS)
        throw new Error(tShared("uploadMinOnePhoto"));

      const payload = {
        title: driverName.trim(),
        description: description.trim() || null,
        driver_name: driverName.trim(),
        vehicle_make: vehicleMake,
        transport_type: transportType,
        vehicle_capacity: Number(vehicleCapacity),
        vehicle_color: vehicleColor || null,
        routes,
        price: Number(price),
        price_unit: priceUnit,
        equipment,
        features,
        languages,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        photos,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("services")
          .update(payload)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        router.push("/dashboard/service");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
          category: "transport",
          status: "pending",
        });

        if (insertError) throw insertError;
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tShared("genericError"));
    } finally {
      setLoading(false);
    }
  }

  const requiredFilled = [
    driverName.trim().length > 0,
    vehicleCapacity.length > 0,
    routes.length > 0,
    price.length > 0,
    photos.length >= MIN_PHOTOS,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 6) * 100));

  const submitDisabled =
    !driverName.trim() ||
    !vehicleCapacity ||
    routes.length === 0 ||
    !price ||
    photos.length < MIN_PHOTOS ||
    !phone.trim();

  return (
    <WizardShell
      title={t("pageTitle")}
      accent="blue"
      progressPercent={progressPercent}
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel={isEditMode ? tShared("save") : tShared("publishListing")}
          submitDisabled={submitDisabled}
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
              <Field label={t("driverName")} required>
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
              <Field label={t("vehicleCapacity")} required>
                <input
                  type="number"
                  value={vehicleCapacity}
                  onChange={(e) => setVehicleCapacity(e.target.value)}
                  placeholder="8"
                  min="1"
                  className={inputClass}
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
            <Field label={t("mainRoutes")} required>
              <div className="flex flex-wrap gap-2">
                {ROUTE_OPTIONS.map((r) => (
                  <Chip
                    key={r.value}
                    active={routes.includes(r.value)}
                    onClick={() => setRoutes(toggle(routes, r.value))}
                  >
                    {tOpts(`transportRoutes.${r.key}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label={t("startingPrice")} required>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="250"
                  min="0"
                  className={inputClass}
                />
              </Field>
              <Field label={t("priceUnit")} required>
                <StyledSelect
                  value={priceUnit}
                  onValueChange={setPriceUnit}
                  options={priceUnitOptions}
                  accent="blue"
                />
              </Field>
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

            <Field label={t("vehiclePhotos")} required>
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
              <Field label={tShared("phoneNumber")} required>
                <PhoneInput value={phone} onChange={setPhone} />
              </Field>
              <Field label={tShared("whatsappNumber")}>
                <PhoneInput value={whatsapp} onChange={setWhatsapp} />
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-bold text-[#334155]">
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
