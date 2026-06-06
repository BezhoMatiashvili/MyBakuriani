"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SkierLoader } from "@/components/shared/SkierLoader";

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "სრული განაკვეთი", label: "სრული განაკვეთი" },
  { value: "ნახევარი განაკვეთი", label: "ნახევარი განაკვეთი" },
  { value: "მოქნილი", label: "მოქნილი" },
] as const;

const SALARY_TYPE_OPTIONS = [
  { value: "ფიქსირებული", label: "ფიქსირებული" },
  { value: "ფიქსირებული + ბონუსი/Tips", label: "ფიქსირებული + ბონუსი/Tips" },
  { value: "გამომუშავებით (%)", label: "გამომუშავებით (%)" },
  { value: "შეთანხმებით", label: "შეთანხმებით" },
] as const;

const EXPERIENCE_OPTIONS = [
  { value: "სასურველია", label: "სასურველია" },
  { value: "არ არის აუცილებელი", label: "არ არის აუცილებელი" },
  { value: "1 წელი", label: "1 წელი" },
  { value: "1+ წელი", label: "1+ წელი" },
] as const;

const ACCOMMODATION_OPTIONS = ["კი", "არა", "შეთანხმებით"] as const;
const MEALS_OPTIONS = ["სრული კვება", "ერთჯერადი კვება", "არ შედის"] as const;
const LANGUAGE_OPTIONS = ["ქართული", "ინგლისური", "რუსული", "სხვა"] as const;

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(isEditMode);

  // Section 1
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState<string>("");
  const [position, setPosition] = useState("");

  // Section 2
  const [employmentType, setEmploymentType] =
    useState<string>("სრული განაკვეთი");
  const [salaryType, setSalaryType] = useState<string>("ფიქსირებული");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryDaily, setSalaryDaily] = useState("");

  // Section 3
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
        setError("განცხადება ვერ მოიძებნა");
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
  }, [editId, user, supabase]);

  const requiredFlags = [
    title.trim().length > 0,
    location.trim().length > 0,
    position.trim().length > 0,
    salaryMin.trim().length > 0,
    salaryMax.trim().length > 0,
    workDescription.trim().length > 0,
  ];
  const requiredFilled = requiredFlags.filter(Boolean).length;
  const progressPercent = Math.max(
    10,
    Math.round((requiredFilled / requiredFlags.length) * 100),
  );
  const submitDisabled = requiredFilled < requiredFlags.length;

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  async function handleSubmit() {
    if (!user) return;
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
        // legacy compatibility
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
        router.push("/dashboard/service");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
          category: "employment",
          status: "pending",
        });

        if (insertError) throw insertError;
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
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
      title="დასაქმება ბაკურიანში"
      accent="blue"
      progressPercent={progressPercent}
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel={isEditMode ? "შენახვა" : "განცხადების გამოქვეყნება"}
          submitDisabled={submitDisabled}
          loading={loading}
          error={error}
        />
      }
    >
      {/* SECTION 1 */}
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="დამსაქმებელი / ობიექტი" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="რესტორანი 'პანორამა'"
              className={inputClass}
            />
          </Field>
          <Field label="ლოკაცია" required>
            <StyledSelect
              value={location}
              onValueChange={setLocation}
              options={locationOptions}
              accent="blue"
            />
          </Field>
        </div>

        <Field label="პოზიცია" required>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="მიმტანი / ბარმენი"
            className={inputClass}
          />
        </Field>
      </WizardInnerCard>

      {/* SECTION 2 */}
      <WizardInnerCard number={2} title="გრაფიკი და ანაზღაურება" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="დასაქმების ტიპი">
            <StyledSelect
              value={employmentType}
              onValueChange={setEmploymentType}
              options={EMPLOYMENT_TYPE_OPTIONS}
              accent="blue"
            />
          </Field>
          <Field label="ანაზღაურების ტიპი">
            <StyledSelect
              value={salaryType}
              onValueChange={setSalaryType}
              options={SALARY_TYPE_OPTIONS}
              accent="blue"
            />
          </Field>
        </div>

        <Field label="ანაზღაურება (₾)" required>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CurrencyInput
                value={salaryMin}
                onChange={setSalaryMin}
                placeholder="1200"
              />
              <span className="text-sm font-medium text-[#94A3B8]">–</span>
              <CurrencyInput
                value={salaryMax}
                onChange={setSalaryMax}
                placeholder="1500"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-xs font-medium text-[#94A3B8]">
                ან
              </span>
              <CurrencyInput
                value={salaryDaily}
                onChange={setSalaryDaily}
                placeholder="დღიური ანაზღაურება"
              />
            </div>
          </div>
        </Field>
      </WizardInnerCard>

      {/* SECTION 3 */}
      <WizardInnerCard
        number={3}
        title="პირობები, აღწერა და მოთხოვნები"
        accent="blue"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="საცხოვრებლით უზრუნველყოფა">
            <PillGroup
              options={ACCOMMODATION_OPTIONS}
              value={accommodation}
              onChange={setAccommodation}
            />
          </Field>
          <Field label="კვებით უზრუნველყოფა">
            <PillGroup
              options={MEALS_OPTIONS}
              value={meals}
              onChange={setMeals}
            />
          </Field>
        </div>

        <Field label="სამუშაოს აღწერა" required>
          <textarea
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            placeholder="ვეძებთ კომუნიკაბელურ და მოტივირებულ მიმტანებს..."
            rows={4}
            className={textareaClass}
          />
        </Field>

        <Field label="მოთხოვნები და კომპეტენციები">
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="ინგლისური ან რუსული ენის სასაუბრო დონეზე ცოდნა..."
            rows={4}
            className={textareaClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="სასურველი ენები">
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={pillClass(active)}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="სამუშაო გამოცდილება">
            <StyledSelect
              value={experience}
              onValueChange={setExperience}
              options={EXPERIENCE_OPTIONS}
              accent="blue"
              placeholder="აირჩიე"
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
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-bold text-[#334155]">
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

function CurrencyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pr-9")}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[#94A3B8]">
        ₾
      </span>
    </div>
  );
}

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
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
            {opt}
          </button>
        );
      })}
    </div>
  );
}
