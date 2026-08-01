"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Check, Clock, ImageIcon } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhoneInput from "@/components/forms/PhoneInput";
import NumberField from "@/components/shared/NumberField";
import TimeRangePicker, {
  isValidTimeRange,
} from "@/components/shared/TimeRangePicker";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { Link } from "@/i18n/navigation";
import { useActiveZones } from "@/lib/zones/client";
import { createClient, createUploadClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { isValidGePhone } from "@/lib/utils/number";
import { cn } from "@/lib/utils";
import {
  contentChangeErrorKey,
  isContentChangeError,
  submitContentChange,
} from "@/lib/content-change/client";
import { scrollToField } from "@/lib/forms/scroll-to-error";
import { watermarkFile } from "@/lib/utils/watermark";

const SERVICE_SPHERES = [
  { value: "cleaning", dbLabel: "დასუფთავება/დამლაგებელი" },
  { value: "handymen", dbLabel: "ხელოსნები" },
  { value: "staff", dbLabel: "მომსახურე პერსონალი" },
  { value: "tourism", dbLabel: "ტურიზმი" },
  { value: "sales", dbLabel: "გაყიდვები/ვაჭრობა" },
  { value: "other", dbLabel: "სხვა" },
] as const;

type SphereValue = (typeof SERVICE_SPHERES)[number]["value"];

const LANGUAGES = [
  { value: "ქართული", key: "ka" },
  { value: "ინგლისური", key: "en" },
  { value: "რუსული", key: "ru" },
] as const;

export default function CreateServicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateServicePageInner />
    </Suspense>
  );
}

function CreateServicePageInner() {
  const t = useTranslations("CreateService");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { zones } = useActiveZones();

  const sphereOptions = useMemo(
    () =>
      SERVICE_SPHERES.map((s) => ({
        value: s.value,
        label: tOpts(`serviceSpheres.${s.value}`),
      })),
    [tOpts],
  );

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);
  const [loadedCategory, setLoadedCategory] = useState<string | null>(null);
  const [existing247Service, setExisting247Service] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [sphere, setSphere] = useState<SphereValue>("cleaning");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [coverageZones, setCoverageZones] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["ქართული", "რუსული"]);
  const [description, setDescription] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00 - 19:00");
  const [is24_7, setIs24_7] = useState(false);
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("services")
        .select("id, title, schedule, operating_hours")
        .eq("owner_id", user.id)
        .eq("category", "cleaning");
      if (cancelled) return;
      const existing = (data ?? []).find(
        (service) =>
          service.id !== editId &&
          (service.schedule?.trim() || service.operating_hours?.trim()) ===
            "24/7",
      );
      setExisting247Service(
        existing ? { id: existing.id, title: existing.title } : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase]);

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

      setLoadedCategory(data.category ?? null);
      setName(data.provider_name ?? "");
      setServiceTitle(data.title ?? "");
      setExperienceYears(
        (data.experience_required ?? "").replace(/\s*წელი\s*$/u, "").trim(),
      );

      const matchedSphere = SERVICE_SPHERES.find(
        (s) => s.dbLabel === data.service_field,
      );
      if (matchedSphere) {
        setSphere(matchedSphere.value);
      } else {
        setSphere(data.category === "cleaning" ? "cleaning" : "handymen");
      }

      setProfilePhoto(
        Array.isArray(data.photos) && data.photos.length > 0
          ? data.photos[0]
          : null,
      );
      setCoverageZones(
        data.location ? data.location.split(", ").filter(Boolean) : [],
      );
      if (Array.isArray(data.languages) && data.languages.length > 0) {
        setLanguages(data.languages);
      }
      setDescription(data.description ?? "");

      const sched = data.schedule ?? data.operating_hours ?? null;
      if (sched === "24/7") {
        setIs24_7(true);
      } else if (sched) {
        setWorkingHours(sched);
      }

      setPrice(data.price != null ? String(data.price) : "");

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
    name.trim().length > 0,
    serviceTitle.trim().length > 0,
    experienceYears.trim().length > 0,
    !!sphere,
    !!profilePhoto,
    coverageZones.length > 0,
    description.trim().length > 0,
    is24_7 || isValidTimeRange(workingHours),
    price.trim().length > 0,
    isValidGePhone(phone),
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 10) * 100));
  const isCleaningListing = isEditMode
    ? loadedCategory === "cleaning"
    : sphere === "cleaning";

  function toggleZone(zone: string) {
    setCoverageZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone],
    );
  }

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  // Admin-managed zones, plus any already-selected value not in the active list
  // (so editing a legacy listing never silently hides/drops a stored zone).
  const zoneOptions = useMemo(() => {
    const names = zones.map((z) => z.name_ka);
    const extras = coverageZones.filter((z) => !names.includes(z));
    return [...names, ...extras];
  }, [zones, coverageZones]);

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!name.trim()) errs.push({ key: "name", message: t("enterName") });
    if (!experienceYears.trim())
      errs.push({ key: "experienceYears", message: t("enterExperience") });
    if (!serviceTitle.trim())
      errs.push({ key: "serviceTitle", message: t("enterServiceTitle") });
    if (!profilePhoto)
      errs.push({
        key: "profilePhoto",
        message: t("uploadProfilePhotoError"),
      });
    if (coverageZones.length === 0)
      errs.push({ key: "coverageZones", message: t("chooseCoverageZone") });
    if (!description.trim())
      errs.push({ key: "description", message: t("enterDescription") });
    if (!is24_7 && !workingHours.trim())
      errs.push({ key: "workingHours", message: t("enterWorkingHours") });
    if (!price.trim()) errs.push({ key: "price", message: t("enterPrice") });
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
      const categoryValue: "cleaning" | "handyman" =
        sphere === "cleaning" ? "cleaning" : "handyman";
      const resolvedCategory =
        editId && loadedCategory ? loadedCategory : categoryValue;

      if (is24_7 && resolvedCategory === "cleaning") {
        const { data: ownedCleaning, error: hoursConflictError } = await supabase
          .from("services")
          .select("id, title, schedule, operating_hours")
          .eq("owner_id", user.id)
          .eq("category", "cleaning");
        if (hoursConflictError) throw hoursConflictError;
        const conflict = (ownedCleaning ?? []).find(
          (service) =>
            service.id !== editId &&
            (service.schedule?.trim() || service.operating_hours?.trim()) ===
              "24/7",
        );
        if (conflict) {
          setExisting247Service({ id: conflict.id, title: conflict.title });
          setError(t("existing247Conflict"));
          setLoading(false);
          submittingRef.current = false;
          return;
        }
      }
      const sphereLabel =
        SERVICE_SPHERES.find((s) => s.value === sphere)?.dbLabel ?? null;

      const payload: Record<string, unknown> = {
        category: resolvedCategory,
        title: serviceTitle.trim(),
        provider_name: name.trim(),
        service_field: sphereLabel,
        description: description.trim() || null,
        price: price ? Number(price) : null,
        price_unit: "საათი",
        schedule: is24_7 ? "24/7" : workingHours.trim() || null,
        operating_hours: is24_7 ? "24/7" : workingHours.trim() || null,
        location: coverageZones.join(", ") || null,
        languages: languages.length > 0 ? languages : null,
        experience_required: experienceYears ? `${experienceYears} წელი` : null,
        photos: profilePhoto ? [profilePhoto] : [],
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
      };

      if (editId) {
        await submitContentChange("service", editId, payload);
        router.push(
          resolvedCategory === "cleaning"
            ? "/dashboard/cleaner"
            : "/dashboard/services",
        );
      } else {
        const { error: insertError } = await supabase
          .from("services")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...payload, owner_id: user.id, status: "pending" } as any);

        if (insertError) throw insertError;
        router.push(
          categoryValue === "cleaning"
            ? "/dashboard/cleaner"
            : "/dashboard/services",
        );
      }
    } catch (err) {
      setError(
        typeof err === "object" &&
          err !== null &&
          "code" in err &&
          err.code === "23505"
          ? t("existing247Conflict")
          : isContentChangeError(err)
          ? tShared(contentChangeErrorKey(err))
          : formatSupabaseError(err, tShared("genericError")),
      );
      submittingRef.current = false;
      setLoading(false);
    }
  }

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
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      ) : (
        <>
          <WizardInnerCard
            number={1}
            title={t("sectionSphereProfile")}
            accent="blue"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={t("nameOrCompany")}
                required
                fieldKey="name"
                error={invalidFields.has("name")}
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  className={inputClass}
                />
              </Field>
              <Field
                label={t("experience")}
                required
                fieldKey="experienceYears"
                error={invalidFields.has("experienceYears")}
              >
                <NumberField
                  value={experienceYears}
                  onChange={setExperienceYears}
                  min={0}
                  max={60}
                  integer
                  placeholder={t("experiencePlaceholder")}
                />
              </Field>
            </div>

            <Field label={t("serviceSphere")} required>
              <StyledSelect
                value={sphere}
                onValueChange={(v) => setSphere(v as SphereValue)}
                options={sphereOptions}
                accent="blue"
              />
            </Field>

            <Field
              label={t("serviceTitle")}
              required
              fieldKey="serviceTitle"
              error={invalidFields.has("serviceTitle")}
            >
              <input
                type="text"
                value={serviceTitle}
                onChange={(e) => setServiceTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className={inputClass}
              />
            </Field>

            <div data-field="profilePhoto" className="scroll-mt-24">
              <ProfilePhotoUpload
                value={profilePhoto}
                onChange={setProfilePhoto}
                invalid={invalidFields.has("profilePhoto")}
              />
            </div>
          </WizardInnerCard>

          <WizardInnerCard number={2} title={t("sectionDetails")} accent="blue">
            <Field
              label={t("coverageZone")}
              required
              uppercase
              fieldKey="coverageZones"
              error={invalidFields.has("coverageZones")}
              labelOnlyError
            >
              <div className="flex flex-wrap gap-2">
                {zoneOptions.map((zone) => (
                  <ChipToggle
                    key={zone}
                    selected={coverageZones.includes(zone)}
                    onClick={() => toggleZone(zone)}
                  >
                    {zone}
                  </ChipToggle>
                ))}
              </div>
            </Field>

            <Field label={t("spokenLanguages")} uppercase>
              <div className="flex flex-wrap gap-3">
                {LANGUAGES.map((lang) => (
                  <LanguageChip
                    key={lang.value}
                    selected={languages.includes(lang.value)}
                    onClick={() => toggleLanguage(lang.value)}
                  >
                    {tOpts(`languages.${lang.key}`)}
                  </LanguageChip>
                ))}
              </div>
            </Field>

            <Field
              label={t("detailedDescription")}
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

          <WizardInnerCard
            number={3}
            title={t("sectionSchedulePrice")}
            accent="blue"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={t("workingHours")}
                required
                uppercase
                fieldKey="workingHours"
                error={invalidFields.has("workingHours")}
                labelOnlyError
              >
                <TimeRangePicker
                  value={workingHours}
                  onChange={setWorkingHours}
                  disabled={is24_7}
                  error={invalidFields.has("workingHours")}
                />
              </Field>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !is24_7 &&
                      isCleaningListing &&
                      existing247Service
                    ) {
                      setError(t("existing247Conflict"));
                      return;
                    }
                    setIs24_7((value) => !value);
                    setError(null);
                  }}
                  className={cn(
                    "flex h-[64px] w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 transition-colors",
                    is24_7
                      ? "border-[#16A34A] bg-[#F0FDF4]"
                      : "border-[#E2E8F0] hover:border-[#CBD5E1]",
                  )}
                  aria-pressed={is24_7}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
                    <Clock className="size-4" strokeWidth={2.2} />
                  </span>
                  <span className="flex-1 text-left">
                    <span className="block text-sm font-bold text-[#0F172A]">
                      {t("mode247")}
                    </span>
                    <span className="block text-xs font-medium text-[#64748B]">
                      {t("worksAtNight")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      is24_7 ? "bg-[#16A34A]" : "bg-[#E2E8F0]",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-5 rounded-full bg-white shadow transition-transform",
                        is24_7 ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>
            </div>

            {isCleaningListing && existing247Service && !is24_7 && (
              <div
                data-testid="existing-247-conflict"
                className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm font-medium text-[#92400E]"
              >
                <p>{t("existing247Conflict")}</p>
                <Link
                  href="/dashboard/cleaner/parameters"
                  className="mt-2 inline-flex font-bold text-[#1D4ED8] underline underline-offset-2"
                >
                  {t("manageWorkingHours")}
                </Link>
              </div>
            )}

            <Field
              label={t("startingPrice")}
              required
              uppercase
              fieldKey="price"
              error={invalidFields.has("price")}
            >
              <NumberField
                value={price}
                onChange={setPrice}
                min={0}
                max={100000}
                integer
                placeholder="50"
                suffix="₾"
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={tShared("phoneNumber")}
                required
                uppercase
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
              <Field label={tShared("whatsappNumber")} uppercase>
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
        </>
      )}
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

function Field({
  label,
  required,
  uppercase,
  fieldKey,
  error,
  labelOnlyError,
  children,
}: {
  label: string;
  required?: boolean;
  uppercase?: boolean;
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
          uppercase && "text-[12px] uppercase tracking-[0.04em]",
        )}
      >
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}

function ChipToggle({
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
      aria-pressed={selected}
      className={cn(
        "h-[40px] rounded-xl px-5 text-sm font-semibold transition-colors",
        selected
          ? "bg-[#2563EB] text-white shadow-[0px_2px_6px_rgba(37,99,235,0.25)]"
          : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]",
      )}
    >
      {children}
    </button>
  );
}

function LanguageChip({
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
      aria-pressed={selected}
      className={cn(
        "flex h-[44px] items-center gap-2.5 rounded-xl border bg-white px-4 text-sm font-semibold transition-colors",
        selected
          ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
          : "border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]",
      )}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-md border transition-colors",
          selected
            ? "border-[#2563EB] bg-[#2563EB] text-white"
            : "border-[#CBD5E1] bg-white",
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

function ProfilePhotoUpload({
  value,
  onChange,
  invalid,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("CreateService");
  const tShared = useTranslations("CreateShared");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    setUploading(true);
    try {
      // Watermark (medium transparency) + re-encode, then store in Storage:
      // this cover is shown publicly on the service card, and services.photos
      // rejects base64/data: URLs via a CHECK constraint, so it must be a
      // Storage URL. The `-wm` suffix marks it watermarked for the backfill.
      const client = createUploadClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) return;
      const watermarked = await watermarkFile(file, {
        outputType: "image/jpeg",
        maxEdge: 2560,
        // opacity/widthRatio inherit watermark.ts DEFAULTS (single source of
        // truth) so the logo stays consistent across every upload path.
      });
      const path = `${user.id}/${crypto.randomUUID()}-wm.jpg`;
      const { error: upErr } = await client.storage
        .from("property-photos")
        .upload(path, watermarked, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = client.storage
        .from("property-photos")
        .getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err) {
      console.warn("[create-service] profile photo upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-2xl border bg-[#F8FAFC] p-4",
        invalid ? "border-[#EF4444]" : "border-[#E2E8F0]",
      )}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "flex size-[88px] shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors",
          value
            ? "border-[#2563EB] bg-white"
            : invalid
              ? "border-[#EF4444] bg-[#FEF2F2] hover:border-[#EF4444]"
              : "border-[#93C5FD] bg-[#EFF6FF] hover:border-[#2563EB]",
          uploading && "opacity-60",
        )}
        aria-label={t("uploadProfilePhoto")}
      >
        {value ? (
          <Image
            src={value}
            alt="Profile"
            width={88}
            height={88}
            className="size-[84px] rounded-full object-cover"
            unoptimized
          />
        ) : (
          <ImageIcon className="size-7 text-[#2563EB]" strokeWidth={2} />
        )}
      </button>
      <div className="flex-1">
        <p className="text-sm font-bold text-[#0F172A]">{t("profilePhoto")}</p>
        <p className="mt-0.5 text-xs font-medium text-[#64748B]">
          {t("profilePhotoHint")}
        </p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-1.5 text-xs font-semibold text-[#EF4444] hover:underline"
          >
            {tShared("delete")}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
