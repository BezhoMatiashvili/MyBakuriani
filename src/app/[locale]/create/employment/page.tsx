"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import NumberField from "@/components/shared/NumberField";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { formatSupabaseError } from "@/lib/utils/formatSupabaseError";
import { cn } from "@/lib/utils";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { scrollToField } from "@/lib/forms/scroll-to-error";

const EMPLOYMENT_TYPE_VALUES = [
  "სრული განაკვეთი",
  "ნახევარი განაკვეთი",
  "მოქნილი",
] as const;

const EMPLOYMENT_TYPE_KEYS: Record<
  (typeof EMPLOYMENT_TYPE_VALUES)[number],
  string
> = {
  "სრული განაკვეთი": "full_time",
  "ნახევარი განაკვეთი": "part_time",
  მოქნილი: "flexible",
};

const SALARY_TYPE_VALUES = [
  "ფიქსირებული",
  "ფიქსირებული + ბონუსი/Tips",
  "გამომუშავებით (%)",
  "შეთანხმებით",
] as const;

const SALARY_TYPE_KEYS: Record<(typeof SALARY_TYPE_VALUES)[number], string> = {
  ფიქსირებული: "fixed",
  "ფიქსირებული + ბონუსი/Tips": "fixed_bonus",
  "გამომუშავებით (%)": "commission",
  შეთანხმებით: "negotiable",
};

const EXPERIENCE_VALUES = [
  "სასურველია",
  "არ არის აუცილებელი",
  "1 წელი",
  "1+ წელი",
] as const;

const EXPERIENCE_KEYS: Record<(typeof EXPERIENCE_VALUES)[number], string> = {
  სასურველია: "preferred",
  "არ არის აუცილებელი": "not_required",
  "1 წელი": "one_year",
  "1+ წელი": "one_plus_year",
};

const ACCOMMODATION_VALUES = ["კი", "არა", "შეთანხმებით"] as const;

const ACCOMMODATION_KEYS: Record<
  (typeof ACCOMMODATION_VALUES)[number],
  string
> = {
  კი: "yes",
  არა: "no",
  შეთანხმებით: "negotiable",
};

const MEALS_VALUES = ["სრული კვება", "ერთჯერადი კვება", "არ შედის"] as const;

const MEALS_KEYS: Record<(typeof MEALS_VALUES)[number], string> = {
  "სრული კვება": "full",
  "ერთჯერადი კვება": "single",
  "არ შედის": "not_included",
};

const LANGUAGE_OPTIONS = [
  { value: "ქართული", key: "ka" },
  { value: "ინგლისური", key: "en" },
  { value: "რუსული", key: "ru" },
  { value: "სხვა", key: "other" },
] as const;

export default function CreateEmploymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateEmploymentPageInner />
    </Suspense>
  );
}

function CreateEmploymentPageInner() {
  const t = useTranslations("CreateEmployment");
  const tShared = useTranslations("CreateShared");
  const tOpts = useTranslations("ListingOptions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();
  const locationOptions = zones.map((z) => ({
    value: z.name_ka,
    label: z.name_ka,
  }));

  const employmentTypeOptions = useMemo(
    () =>
      EMPLOYMENT_TYPE_VALUES.map((value) => ({
        value,
        label: tOpts(`employmentTypes.${EMPLOYMENT_TYPE_KEYS[value]}`),
      })),
    [tOpts],
  );

  const salaryTypeOptions = useMemo(
    () =>
      SALARY_TYPE_VALUES.map((value) => ({
        value,
        label: tOpts(`salaryTypes.${SALARY_TYPE_KEYS[value]}`),
      })),
    [tOpts],
  );

  const experienceOptions = useMemo(
    () =>
      EXPERIENCE_VALUES.map((value) => ({
        value,
        label: tOpts(`experienceOptions.${EXPERIENCE_KEYS[value]}`),
      })),
    [tOpts],
  );

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [hydrating, setHydrating] = useState(isEditMode);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<string>("");
  const [position, setPosition] = useState("");

  const [employmentType, setEmploymentType] =
    useState<string>("სრული განაკვეთი");
  const [salaryType, setSalaryType] = useState<string>("ფიქსირებული");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryDaily, setSalaryDaily] = useState("");

  const [accommodation, setAccommodation] = useState<string>("");
  const [meals, setMeals] = useState<string>("");
  const [workDescription, setWorkDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [experience, setExperience] = useState<string>("");

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
      setLocation(data.location ?? "");
      setPosition(data.position ?? "");
      setEmploymentType(data.employment_type ?? "სრული განაკვეთი");
      setSalaryType(data.salary_type ?? "ფიქსირებული");
      setSalaryMin(data.salary_min != null ? String(data.salary_min) : "");
      setSalaryMax(data.salary_max != null ? String(data.salary_max) : "");
      setSalaryDaily(
        data.salary_daily != null ? String(data.salary_daily) : "",
      );
      setAccommodation(data.accommodation ?? "");
      setMeals(data.meals ?? "");
      setWorkDescription(data.description ?? "");
      setRequirements(data.requirements ?? "");
      setLanguages(
        Array.isArray(data.languages)
          ? (data.languages as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [],
      );
      setExperience(data.experience_required ?? "");

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase, tShared]);

  // Salary is optional. The employer fills either a min–max range or a daily
  // wage — never both; entering one mode disables the other.
  const rangeActive =
    salaryMin.trim().length > 0 || salaryMax.trim().length > 0;
  const dailyActive = salaryDaily.trim().length > 0;

  const requiredFlags = [
    title.trim().length > 0,
    location.trim().length > 0,
    position.trim().length > 0,
    workDescription.trim().length > 0,
  ];
  const requiredFilled = requiredFlags.filter(Boolean).length;
  const progressPercent = Math.max(
    10,
    Math.round((requiredFilled / requiredFlags.length) * 100),
  );
  const salaryRangeInvalid =
    salaryMin.trim().length > 0 &&
    salaryMax.trim().length > 0 &&
    Number(salaryMin) > Number(salaryMax);

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  function languageLabel(lang: (typeof LANGUAGE_OPTIONS)[number]): string {
    if (lang.key === "other") {
      return lang.value;
    }
    return tOpts(`languages.${lang.key}`);
  }

  function validate(): { key: string; message: string }[] {
    const errs: { key: string; message: string }[] = [];
    if (!title.trim()) errs.push({ key: "title", message: t("enterEmployer") });
    if (!location.trim())
      errs.push({ key: "location", message: t("chooseLocation") });
    if (!position.trim())
      errs.push({ key: "position", message: t("enterPosition") });
    if (!workDescription.trim())
      errs.push({ key: "workDescription", message: t("enterJobDescription") });
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
    // Cross-field safety net: min must not exceed max.
    if (salaryRangeInvalid) {
      setInvalidFields(new Set(["salary"]));
      setError(t("enterSalary"));
      scrollToField("salary");
      return;
    }
    setInvalidFields(new Set());

    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: title.trim() || position.trim(),
        description: workDescription.trim() || null,
        position: position.trim() || null,
        location: location || null,
        employment_type: employmentType || null,
        salary_type: salaryType || null,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        salary_daily: salaryDaily ? Number(salaryDaily) : null,
        accommodation: accommodation || null,
        meals: meals || null,
        requirements: requirements.trim() || null,
        languages: languages.length > 0 ? languages : null,
        experience_required: experience || null,
        salary_range:
          salaryMin && salaryMax ? `${salaryMin}-${salaryMax} ₾` : null,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("services")
          .update(payload)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        router.push("/dashboard/employment");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
          category: "employment",
          status: "pending",
        });

        if (insertError) throw insertError;
        router.push("/dashboard/employment");
      }
    } catch (err) {
      setError(formatSupabaseError(err, tShared("genericError")));
      submittingRef.current = false;
      setLoading(false);
    }
  }

  if (hydrating) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <SkierLoader variant="inline" />
      </div>
    );
  }

  return (
    <WizardShell
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
          submitLabel={isEditMode ? tShared("save") : tShared("publishListing")}
          submitDisabled={loading}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard number={1} title={tShared("basicInfo")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label={t("employer")}
            required
            fieldKey="title"
            error={invalidFields.has("title")}
          >
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("employerPlaceholder")}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("location")}
            required
            fieldKey="location"
            error={invalidFields.has("location")}
          >
            <StyledSelect
              value={location}
              onValueChange={setLocation}
              options={locationOptions}
              placeholder={tShared("chooseZone")}
              accent="blue"
            />
          </Field>
        </div>

        <Field
          label={t("position")}
          required
          fieldKey="position"
          error={invalidFields.has("position")}
        >
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t("positionPlaceholder")}
            className={inputClass}
          />
        </Field>
      </WizardInnerCard>

      <WizardInnerCard number={2} title={t("sectionSchedulePay")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t("employmentType")}>
            <StyledSelect
              value={employmentType}
              onValueChange={setEmploymentType}
              options={employmentTypeOptions}
              accent="blue"
            />
          </Field>
          <Field label={t("salaryType")}>
            <StyledSelect
              value={salaryType}
              onValueChange={setSalaryType}
              options={salaryTypeOptions}
              accent="blue"
            />
          </Field>
        </div>

        <Field
          label={t("salary")}
          fieldKey="salary"
          error={invalidFields.has("salary")}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <NumberField
                  value={salaryMin}
                  onChange={setSalaryMin}
                  min={0}
                  max={999999}
                  integer
                  suffix="₾"
                  accent="blue"
                  placeholder="1200"
                  disabled={dailyActive && !rangeActive}
                />
              </div>
              <span className="text-sm font-medium text-[#94A3B8]">–</span>
              <div className="flex-1">
                <NumberField
                  value={salaryMax}
                  onChange={setSalaryMax}
                  min={0}
                  max={999999}
                  integer
                  suffix="₾"
                  accent="blue"
                  placeholder="1500"
                  disabled={dailyActive && !rangeActive}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-xs font-medium text-[#94A3B8]">
                {tShared("or")}
              </span>
              <div className="flex-1">
                <NumberField
                  value={salaryDaily}
                  onChange={setSalaryDaily}
                  min={0}
                  max={999999}
                  integer
                  suffix="₾"
                  accent="blue"
                  placeholder={t("dailySalaryPlaceholder")}
                  disabled={rangeActive}
                />
              </div>
            </div>
          </div>
        </Field>
      </WizardInnerCard>

      <WizardInnerCard number={3} title={t("sectionConditions")} accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t("accommodation")}>
            <PillGroup
              options={ACCOMMODATION_VALUES}
              value={accommodation}
              onChange={setAccommodation}
              getLabel={(v) =>
                tOpts(`accommodationOptions.${ACCOMMODATION_KEYS[v]}`)
              }
            />
          </Field>
          <Field label={t("meals")}>
            <PillGroup
              options={MEALS_VALUES}
              value={meals}
              onChange={setMeals}
              getLabel={(v) => tOpts(`mealsOptions.${MEALS_KEYS[v]}`)}
            />
          </Field>
        </div>

        <Field
          label={t("jobDescription")}
          required
          fieldKey="workDescription"
          error={invalidFields.has("workDescription")}
        >
          <textarea
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            placeholder={t("jobDescriptionPlaceholder")}
            rows={4}
            className={textareaClass}
          />
        </Field>

        <Field label={t("requirements")}>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder={t("requirementsPlaceholder")}
            rows={4}
            className={textareaClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label={t("preferredLanguages")}>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = languages.includes(lang.value);
                return (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => toggleLanguage(lang.value)}
                    className={pillClass(active)}
                  >
                    {languageLabel(lang)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t("workExperience")}>
            <StyledSelect
              value={experience}
              onValueChange={setExperience}
              options={experienceOptions}
              accent="blue"
              placeholder={tShared("choose")}
            />
          </Field>
        </div>
      </WizardInnerCard>
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

const textareaClass =
  "w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

function pillClass(active: boolean) {
  return cn(
    "h-10 rounded-full px-5 text-sm font-semibold transition-colors",
    active
      ? "bg-[#2563EB] text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)]"
      : "bg-[#F1F5F9] text-[#334155] hover:bg-[#E2E8F0]",
  );
}

function Field({
  label,
  required,
  helper,
  fieldKey,
  error,
  labelOnlyError,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
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
        {helper && (
          <span className="ml-1.5 text-[11px] font-medium text-[#94A3B8]">
            {helper}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  getLabel,
}: {
  options: readonly T[];
  value: string;
  onChange: (v: string) => void;
  getLabel: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            className={pillClass(active)}
          >
            {getLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}
