"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  ChangeEvent,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText, Link2, MapPin, X } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import TimeRangePicker, {
  isValidTimeRange,
} from "@/components/shared/TimeRangePicker";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { isValidGePhone } from "@/lib/utils/number";
import { safeHttpsUrl } from "@/lib/security";
import { scrollToField } from "@/lib/forms/scroll-to-error";
import { cn } from "@/lib/utils";
import {
  contentChangeErrorKey,
  isContentChangeError,
  submitContentChange,
} from "@/lib/content-change/client";
import {
  FOOD_AMENITIES,
  type FoodAmenityKey,
  RESTAURANT_TYPES,
  CUISINE_TYPES,
  AVG_CHECK_OPTIONS,
} from "@/lib/constants/listing-options";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 10;

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

export default function CreateFoodPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateFoodPageInner />
    </Suspense>
  );
}

function CreateFoodPageInner() {
  const t = useTranslations("CreateFood");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();
  const zoneOptions = zones.map((z) => ({
    value: z.name_ka,
    label: z.name_ka,
  }));

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);

  const [title, setTitle] = useState("");
  const [restaurantType, setRestaurantType] = useState("restaurant");
  const [cuisineType, setCuisineType] = useState("");
  const [zone, setZone] = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [showMap, setShowMap] = useState(false);
  const [avgCheck, setAvgCheck] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [amenities, setAmenities] = useState<Record<FoodAmenityKey, boolean>>(
    () =>
      FOOD_AMENITIES.reduce(
        (acc, a) => {
          acc[a.key] = false;
          return acc;
        },
        {} as Record<FoodAmenityKey, boolean>,
      ),
  );
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [menuUrlInput, setMenuUrlInput] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const menuFileRef = useRef<HTMLInputElement>(null);

  const restaurantTypeOptions = useMemo(
    () =>
      RESTAURANT_TYPES.map((o) => ({
        value: o.value,
        label: tOpts(`restaurantTypes.${o.value}`),
      })),
    [tOpts],
  );
  const cuisineTypeOptions = useMemo(
    () =>
      CUISINE_TYPES.map((o) => ({
        value: o.value,
        label: tOpts(`cuisineTypes.${o.value}`),
      })),
    [tOpts],
  );

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
      setRestaurantType(
        RESTAURANT_TYPES.find(
          (t) =>
            t.label === data.restaurant_type ||
            t.value === data.restaurant_type,
        )?.value ?? "restaurant",
      );
      setCuisineType(
        CUISINE_TYPES.find(
          (t) => t.label === data.cuisine_type || t.value === data.cuisine_type,
        )?.value ?? "",
      );
      setZone(data.location ?? "");

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

      setAvgCheck(data.avg_check ?? "");
      setOperatingHours(data.operating_hours ?? "");
      setAmenities(
        FOOD_AMENITIES.reduce(
          (acc, a) => {
            acc[a.key] = Boolean(data[a.key]);
            return acc;
          },
          {} as Record<FoodAmenityKey, boolean>,
        ),
      );
      setMenuUrlInput(data.menu_url ?? "");
      setDescription(data.description ?? "");
      const stripPrefix = (v: string | null) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";
      setPhone(stripPrefix(data.phone));
      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase]);

  function onPickMenuFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError(t("menuMustBePdf"));
      return;
    }
    setMenuFile(file);
    setMenuUrlInput("");
    setError(null);
  }

  async function uploadMenuPdf(): Promise<string | null> {
    if (!menuFile || !user) return null;
    const path = `${user.id}/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("restaurant-menus")
      .upload(path, menuFile, { contentType: "application/pdf" });
    if (upErr)
      throw new Error(t("menuUploadFailed", { message: upErr.message }));
    const { data } = supabase.storage
      .from("restaurant-menus")
      .getPublicUrl(path);
    return data.publicUrl;
  }

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!title.trim()) errs.push({ key: "title", message: t("enterTitle") });
    if (!zone) errs.push({ key: "zone", message: t("chooseLocation") });
    if (!operatingHours.trim())
      errs.push({
        key: "operatingHours",
        message: t("enterOperatingHours"),
      });
    if (photos.length < MIN_PHOTOS) {
      errs.push({
        key: "photos",
        message: tShared("minPhotosRequired", { count: MIN_PHOTOS }),
      });
    }
    if (!phone.trim()) {
      errs.push({ key: "phone", message: tShared("enterPhone") });
    }
    if (menuUrlInput.trim() && !safeHttpsUrl(menuUrlInput.trim())) {
      errs.push({ key: "menuUrl", message: t("invalidMenuUrl") });
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
      let menuUrl: string | null = null;
      if (menuFile) {
        menuUrl = await uploadMenuPdf();
      } else if (menuUrlInput.trim()) {
        menuUrl = safeHttpsUrl(menuUrlInput.trim());
      }

      const payload = {
        category: "food" as const,
        title: title.trim(),
        description: description.trim() || null,
        restaurant_type:
          RESTAURANT_TYPES.find((t) => t.value === restaurantType)?.label ||
          null,
        cuisine_type:
          CUISINE_TYPES.find((t) => t.value === cuisineType)?.label || null,
        avg_check: avgCheck || null,
        menu_url: menuUrl,
        ...amenities,
        operating_hours: operatingHours.trim() || null,
        location: zone || exactLocation.trim() || null,
        coords: coords ?? null,
        phone: phone ? `+995${phone}` : null,
        photos,
      };

      if (editId) {
        await submitContentChange("service", editId, payload);
        router.push("/dashboard/food");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
          status: "pending",
        });

        if (insertError) throw insertError;
        router.push("/dashboard/food");
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
    title.trim().length > 0,
    zone.length > 0,
    isValidTimeRange(operatingHours),
    photos.length >= MIN_PHOTOS,
    isValidGePhone(phone),
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 5) * 100));

  return (
    <WizardShell
      mobileDensity="compact"
      title={t("pageTitle")}
      accent="orange"
      progressPercent={progressPercent}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      footer={
        <WizardFooter
          accent="orange"
          backHref="/create"
          submitLabel={
            isEditMode
              ? tShared("contentChange.submitForReview")
              : tShared("publishListing")
          }
          submitDisabled={loading}
          loading={loading}
          error={error}
        />
      }
    >
      {hydrating ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1 — Basic info */}
          <WizardInnerCard
            number={1}
            title={tShared("basicInfo")}
            accent="orange"
          >
            <Field
              label={t("objectTitle")}
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
              <Field label={t("restaurantType")} required>
                <StyledSelect
                  value={restaurantType}
                  onValueChange={setRestaurantType}
                  options={restaurantTypeOptions}
                  accent="orange"
                />
              </Field>
              <Field label={t("cuisineType")}>
                <StyledSelect
                  value={cuisineType}
                  onValueChange={setCuisineType}
                  options={cuisineTypeOptions}
                  placeholder={tShared("chooseType")}
                  accent="orange"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={t("locationZone")}
                required
                fieldKey="zone"
                error={invalidFields.has("zone")}
              >
                <StyledSelect
                  value={zone}
                  onValueChange={setZone}
                  options={zoneOptions}
                  placeholder={tShared("chooseZone")}
                  accent="orange"
                />
              </Field>
              <Field label={t("exactLocation")}>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={exactLocation}
                    onChange={(e) => setExactLocation(e.target.value)}
                    placeholder={t("exactLocationPlaceholder")}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowMap((v) => !v)}
                    aria-pressed={showMap}
                    className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-[0px_4px_10px_rgba(249,115,22,0.25)] transition-colors hover:bg-[#EA580C]"
                    aria-label={tShared("showOnMap")}
                  >
                    <MapPin className="size-5" strokeWidth={2.25} />
                  </button>
                </div>
              </Field>
            </div>

            {showMap && (
              <ExactLocationPicker value={coords} onChange={setCoords} />
            )}

            <Field label={tShared("description")}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={4}
                className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]"
              />
            </Field>
          </WizardInnerCard>

          {/* Section 2 — Details & services */}
          <WizardInnerCard
            number={2}
            title={t("sectionDetails")}
            accent="orange"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={t("avgCheck")}
                fieldKey="avgCheck"
                error={invalidFields.has("avgCheck")}
              >
                <StyledSelect
                  value={avgCheck}
                  onValueChange={setAvgCheck}
                  options={AVG_CHECK_OPTIONS}
                  placeholder={tShared("choosePrice")}
                  accent="orange"
                />
              </Field>
              <Field
                label={t("operatingHours")}
                required
                fieldKey="operatingHours"
                error={invalidFields.has("operatingHours")}
                labelOnlyError
              >
                <TimeRangePicker
                  value={operatingHours}
                  onChange={setOperatingHours}
                  accent="orange"
                />
              </Field>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-bold text-[#334155]">
                {t("extraDetails")}
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {FOOD_AMENITIES.map((a) => (
                  <ServiceCheckbox
                    key={a.key}
                    label={tOpts(`foodAmenities.${a.key}`)}
                    checked={amenities[a.key]}
                    onChange={(v) =>
                      setAmenities((prev) => ({ ...prev, [a.key]: v }))
                    }
                  />
                ))}
              </div>
            </div>
          </WizardInnerCard>

          {/* Section 3 — Menu & photos */}
          <WizardInnerCard
            number={3}
            title={t("sectionMenuPhotos")}
            accent="orange"
          >
            <Field
              label={t("menuOptional")}
              fieldKey="menuUrl"
              error={invalidFields.has("menuUrl")}
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => menuFileRef.current?.click()}
                  className="flex h-[68px] items-center gap-3 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-left transition-colors hover:border-[#F97316] hover:bg-[#FFF7ED]"
                >
                  <FileText className="size-6 shrink-0 text-[#F97316]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#334155]">
                      {menuFile ? menuFile.name : t("uploadMenu")}
                    </div>
                    <div className="text-xs text-[#94A3B8]">{t("pdfOnly")}</div>
                  </div>
                  {menuFile && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFile(null);
                        if (menuFileRef.current) menuFileRef.current.value = "";
                      }}
                      className="flex size-11 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#EF4444]/10 hover:text-[#EF4444] lg:size-6"
                      aria-label={tShared("delete")}
                    >
                      <X className="size-4" />
                    </span>
                  )}
                </button>
                <input
                  ref={menuFileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={onPickMenuFile}
                />

                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="url"
                    value={menuUrlInput}
                    onChange={(e) => {
                      setMenuUrlInput(e.target.value);
                      if (e.target.value) setMenuFile(null);
                    }}
                    placeholder={t("menuUrlPlaceholder")}
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
            </Field>

            <Field
              label={t("objectPhotos")}
              required
              fieldKey="photos"
              error={invalidFields.has("photos")}
              labelOnlyError
              chip={{
                label: tShared("minPhotos", { count: MIN_PHOTOS }),
                variant: "orange",
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

          {/* Section 4 — Contact */}
          <WizardInnerCard
            number={4}
            title={tShared("contactInfo")}
            accent="orange"
          >
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
          </WizardInnerCard>
        </div>
      )}
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]";

function ServiceCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-2 transition-colors ${
        checked
          ? "border-[#F97316] bg-[#FFF7ED]"
          : "border-[#E2E8F0] bg-white hover:border-[#F97316]/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded accent-[#F97316]"
      />
      <span className="text-sm font-medium text-[#334155]">{label}</span>
    </label>
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
  chip?: { label: string; variant?: "green" | "blue" | "orange" };
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
        chip.variant === "green"
          ? "rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]"
          : chip.variant === "orange"
            ? "rounded-md bg-[#FFEDD5] px-2 py-0.5 text-[10px] font-bold text-[#C2410C]"
            : "rounded-md bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold text-[#1D4ED8]"
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
