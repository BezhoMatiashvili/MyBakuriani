"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import NumberField from "@/components/shared/NumberField";
import TimeRangePicker, {
  isValidTimeRange,
} from "@/components/shared/TimeRangePicker";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { isValidGePhone } from "@/lib/utils/number";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { scrollToField } from "@/lib/forms/scroll-to-error";
import { cn } from "@/lib/utils";
import {
  contentChangeErrorKey,
  isContentChangeError,
  submitContentChange,
} from "@/lib/content-change/client";

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

const ACTIVITY_TYPES = [
  { value: "extreme", dbLabel: "ექსტრემალური" },
  { value: "sport", dbLabel: "სპორტული" },
  { value: "kids", dbLabel: "ბავშვებისთვის" },
  { value: "family", dbLabel: "ოჯახისთვის" },
  { value: "other", dbLabel: "სხვა" },
] as const;

const ACTIVITY_CATEGORIES = [
  { value: "inventory_rent", dbLabel: "ინვენტარი" },
  { value: "horses", dbLabel: "ცხენები" },
  { value: "buggies", dbLabel: "ბურანები" },
  { value: "quad_bikes", dbLabel: "კვადროციკლები" },
  { value: "buggy", dbLabel: "ბაგი" },
  { value: "other", dbLabel: "სხვა" },
] as const;

const DURATIONS = [
  { value: "15min", dbLabel: "15 წუთი" },
  { value: "30min", dbLabel: "30 წუთი" },
  { value: "1h", dbLabel: "1 საათი" },
  { value: "1h+", dbLabel: "1+ საათი" },
] as const;

const AGES = [
  { value: "any", dbLabel: "ნებისმიერი" },
  { value: "12+", dbLabel: "12+" },
  { value: "16+", dbLabel: "16+" },
] as const;

const GOOD_FOR = [
  { value: "all", dbLabel: "ყველასთვის" },
  { value: "extreme_lovers", dbLabel: "ექსტრემის მოყვარულთა" },
] as const;

const PRICE_UNITS = [
  { value: "15min", dbLabel: "15 წუთზე" },
  { value: "1h", dbLabel: "1 საათზე" },
  { value: "full_day", dbLabel: "სრულ დღეზე" },
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];
type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["value"];
type Duration = (typeof DURATIONS)[number]["value"];
type Age = (typeof AGES)[number]["value"];
type GoodFor = (typeof GOOD_FOR)[number]["value"];
type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

const MAX_PHOTOS = 5;

function findValueByDbLabel<T extends string>(
  options: readonly { value: T; dbLabel: string }[],
  stored: string | null | undefined,
): T | null {
  if (!stored) return null;
  return (
    options.find((o) => o.dbLabel === stored || o.value === stored)?.value ??
    null
  );
}

function ageDisplayLabel(value: Age, tOpts: (key: string) => string): string {
  if (value === "any") return tOpts("ageOptions.any");
  return value;
}

export default function CreateEntertainmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateEntertainmentPageInner />
    </Suspense>
  );
}

function CreateEntertainmentPageInner() {
  const t = useTranslations("CreateEntertainment");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const tFood = useTranslations("CreateFood");
  const tService = useTranslations("CreateService");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = createClient();
  const { zones: activeZones } = useActiveZones();
  const zoneOptions = activeZones.map((z) => ({
    value: z.name_ka,
    label: z.name_ka,
  }));

  const activityTypeOptions = useMemo(
    () =>
      ACTIVITY_TYPES.map((o) => ({
        value: o.value,
        label: tOpts(`entertainmentTypes.${o.value}`),
      })),
    [tOpts],
  );

  const categoryOptions = useMemo(
    () =>
      ACTIVITY_CATEGORIES.map((o) => ({
        value: o.value,
        label: tOpts(`entertainmentCategories.${o.value}`),
      })),
    [tOpts],
  );

  const durationOptions = useMemo(
    () =>
      DURATIONS.map((o) => ({
        value: o.value,
        label: tOpts(`durations.${o.value}`),
      })),
    [tOpts],
  );

  const ageOptions = useMemo(
    () =>
      AGES.map((o) => ({
        value: o.value,
        label: ageDisplayLabel(o.value, tOpts),
      })),
    [tOpts],
  );

  const goodForOptions = useMemo(
    () =>
      GOOD_FOR.map((o) => ({
        value: o.value,
        label: tOpts(`audienceOptions.${o.value}`),
      })),
    [tOpts],
  );

  const priceUnitOptions = useMemo(
    () =>
      PRICE_UNITS.map((o) => ({
        value: o.value,
        label: tOpts(`pricePerOptions.${o.value}`),
      })),
    [tOpts],
  );

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);

  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("extreme");
  const [category, setCategory] = useState<ActivityCategory>("buggies");
  const [zone, setZone] = useState<string>("");
  const [exactLocation, setExactLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [showMap, setShowMap] = useState(false);
  const [description, setDescription] = useState("");

  const [duration, setDuration] = useState<Duration>("1h");
  const [ageMin, setAgeMin] = useState<Age>("16+");
  const [goodFor, setGoodFor] = useState<GoodFor>("extreme_lovers");
  const [workingHours, setWorkingHours] = useState("10:00 - 18:00");
  const [safetyNotes, setSafetyNotes] = useState("");

  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("1h");
  const [photos, setPhotos] = useState<string[]>([]);

  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

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

      setTitle(data.title ?? "");
      setDescription(data.description ?? "");

      const at = findValueByDbLabel(ACTIVITY_TYPES, data.activity_type);
      if (at) setActivityType(at);
      const cat = findValueByDbLabel(
        ACTIVITY_CATEGORIES,
        data.activity_category,
      );
      if (cat) setCategory(cat);
      const dur = findValueByDbLabel(DURATIONS, data.duration);
      if (dur) setDuration(dur);
      const age = findValueByDbLabel(AGES, data.age_min);
      if (age) setAgeMin(age);
      const gf = findValueByDbLabel(GOOD_FOR, data.good_for);
      if (gf) setGoodFor(gf);
      const pu = findValueByDbLabel(PRICE_UNITS, data.price_unit);
      if (pu) setPriceUnit(pu);

      setSafetyNotes(data.safety_notes ?? "");
      setPrice(data.price != null ? String(data.price) : "");
      setWorkingHours(data.schedule ?? data.operating_hours ?? "");

      if (data.location) {
        const parts = data.location.split(" • ");
        setZone(parts[0] ?? "");
        setExactLocation(parts.slice(1).join(" • "));
      }

      const rawCoords = data.coords;
      if (
        rawCoords &&
        typeof rawCoords === "object" &&
        !Array.isArray(rawCoords)
      ) {
        const obj = rawCoords as Record<string, unknown>;
        if (typeof obj.lat === "number" && typeof obj.lng === "number") {
          setCoords({ lat: obj.lat, lng: obj.lng });
          setShowMap(true);
        }
      }

      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      const stripPrefix = (v: string | null | undefined) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";
      setPhone(stripPrefix(data.phone));
      setWhatsapp(stripPrefix((data as { whatsapp?: string | null }).whatsapp));

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase, tShared]);

  const requiredFilled = [
    title.trim().length > 0,
    description.trim().length > 0,
    price.trim().length > 0,
    photos.length > 0,
    isValidGePhone(phone),
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 5) * 100));

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!title.trim()) errs.push({ key: "title", message: t("enterTitle") });
    if (!description.trim())
      errs.push({ key: "description", message: t("enterDescription") });
    if (!price.trim()) errs.push({ key: "price", message: t("enterPrice") });
    if (photos.length === 0)
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
      const activityTypeLabel = ACTIVITY_TYPES.find(
        (item) => item.value === activityType,
      )?.dbLabel;
      const categoryLabel = ACTIVITY_CATEGORIES.find(
        (c) => c.value === category,
      )?.dbLabel;
      const durationLabel = DURATIONS.find(
        (d) => d.value === duration,
      )?.dbLabel;
      const ageLabel = AGES.find((a) => a.value === ageMin)?.dbLabel;
      const goodForLabel = GOOD_FOR.find((g) => g.value === goodFor)?.dbLabel;
      const priceUnitLabel = PRICE_UNITS.find(
        (p) => p.value === priceUnit,
      )?.dbLabel;

      const payload: Record<string, unknown> = {
        category: "entertainment",
        title: title.trim(),
        description: description.trim() || null,
        activity_type: activityTypeLabel || null,
        activity_category: categoryLabel || null,
        duration: durationLabel || null,
        age_min: ageLabel || null,
        good_for: goodForLabel || null,
        safety_notes: safetyNotes.trim() || null,
        price: price ? Number(price) : null,
        price_unit: priceUnitLabel || null,
        schedule: isValidTimeRange(workingHours) ? workingHours.trim() : null,
        operating_hours: isValidTimeRange(workingHours)
          ? workingHours.trim()
          : null,
        location: [zone, exactLocation.trim()].filter(Boolean).join(" • "),
        coords: coords ?? null,
        photos,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
      };

      if (editId) {
        await submitContentChange("service", editId, payload);
      } else {
        const { error: insertError } = await supabase
          .from("services")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...payload, owner_id: user.id, status: "pending" } as any);

        if (insertError) throw insertError;
      }

      router.push("/dashboard/entertainment");
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

  if (hydrating) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SkierLoader variant="inline" />
      </div>
    );
  }

  return (
    <WizardShell
      title={t("pageTitle")}
      subtitle={t("subtitle")}
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
      <WizardInnerCard number={1} title={tShared("basicInfo")} accent="blue">
        <Field
          label={t("title")}
          required
          fieldKey="title"
          error={invalidFields.has("title")}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t("entertainmentType")} required>
            <StyledSelect
              value={activityType}
              onValueChange={(v) => setActivityType(v as ActivityType)}
              options={activityTypeOptions}
              accent="blue"
            />
          </Field>
          <Field label={t("category")} required>
            <StyledSelect
              value={category}
              onValueChange={(v) => setCategory(v as ActivityCategory)}
              options={categoryOptions}
              accent="blue"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t("zoneTrack")} required>
            <StyledSelect
              value={zone}
              onValueChange={(v) => setZone(v)}
              options={zoneOptions}
              placeholder={tShared("chooseZone")}
              accent="blue"
            />
          </Field>
          <Field label={t("exactLocation")}>
            <div className="flex gap-2">
              <input
                type="text"
                value={exactLocation}
                onChange={(e) => setExactLocation(e.target.value)}
                placeholder={tFood("exactLocationPlaceholder")}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="flex size-[48px] shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8]"
                aria-label={tShared("pickOnMap")}
                aria-pressed={showMap}
              >
                <MapPin className="size-5" />
              </button>
            </div>
          </Field>
        </div>

        {showMap && <ExactLocationPicker value={coords} onChange={setCoords} />}

        <Field
          label={t("descriptionLabel")}
          required
          fieldKey="description"
          error={invalidFields.has("description")}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>
      </WizardInnerCard>

      <WizardInnerCard number={2} title={t("sectionFeatures")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field label={t("duration")}>
            <StyledSelect
              value={duration}
              onValueChange={(v) => setDuration(v as Duration)}
              options={durationOptions}
              accent="blue"
            />
          </Field>
          <Field label={t("age")}>
            <StyledSelect
              value={ageMin}
              onValueChange={(v) => setAgeMin(v as Age)}
              options={ageOptions}
              accent="blue"
            />
          </Field>
          <Field label={t("audience")}>
            <StyledSelect
              value={goodFor}
              onValueChange={(v) => setGoodFor(v as GoodFor)}
              options={goodForOptions}
              accent="blue"
            />
          </Field>
          <Field label={tService("workingHours")}>
            <TimeRangePicker
              value={workingHours}
              onChange={setWorkingHours}
              accent="blue"
            />
          </Field>
        </div>

        <Field label={t("safetyConditions")}>
          <textarea
            value={safetyNotes}
            onChange={(e) => setSafetyNotes(e.target.value)}
            placeholder={t("safetyPlaceholder")}
            rows={3}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>
      </WizardInnerCard>

      <WizardInnerCard number={3} title={t("sectionTariff")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label={t("tariff")}
            required
            fieldKey="price"
            error={invalidFields.has("price")}
          >
            <NumberField
              value={price}
              onChange={setPrice}
              min={0}
              max={100000}
              integer
              placeholder="100"
              suffix="₾"
              error={invalidFields.has("price")}
            />
          </Field>
          <Field label={t("priceGivenFor")} required>
            <StyledSelect
              value={priceUnit}
              onValueChange={(v) => setPriceUnit(v as PriceUnit)}
              options={priceUnitOptions}
              accent="blue"
            />
          </Field>
        </div>

        <Field
          label={t("uploadPhotos")}
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

      <WizardInnerCard number={4} title={t("sectionContact")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label={t("phone")}
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
      </WizardInnerCard>
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
          "block text-[13px] font-bold",
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
