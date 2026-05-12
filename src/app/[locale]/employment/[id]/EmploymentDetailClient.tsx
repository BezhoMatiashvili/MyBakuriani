"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  MapPin,
  Banknote,
  Clock as ClockIcon,
  Building2,
  Upload,
  CheckCircle2,
  FileText,
  Leaf,
  Users,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Tables, TablesInsert } from "@/lib/types/database";
import PhoneInput from "@/components/forms/PhoneInput";
import { MobileStickyCTA } from "@/components/shared/MobileStickyCTA";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface Props {
  service: ServiceWithOwner;
  isMock?: boolean;
  applicationsCount: number;
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[16px] border p-4 ${
        accent ? "border-[#BBF7D0] bg-[#F0FDF4]" : "border-[#E2E8F0] bg-white"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.5px] ${
          accent ? "text-[#16A34A]" : "text-[#94A3B8]"
        }`}
      >
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </div>
      <p
        className={`mt-1 text-[15px] font-black ${
          accent ? "text-[#16A34A]" : "text-[#1E293B]"
        }`}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
          {subtext}
        </p>
      )}
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-4 first:pt-0">
      <dt className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
        {label}
      </dt>
      <dd className="mt-1.5 text-[15px] font-black text-[#0F172A]">{value}</dd>
    </div>
  );
}

function salaryModelLabel(salaryType: string | null): string {
  if (!salaryType) return "ფიქსირებული დღიური";
  const map: Record<string, string> = {
    fixed_daily: "ფიქსირებული დღიური",
    fixed_monthly: "ფიქსირებული თვიური",
    hourly: "საათობრივი",
    negotiable: "შეთანხმებითი",
  };
  return map[salaryType] ?? salaryType;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

const REQUIREMENTS = [
  "სისწრაფე და დეტალებზე ორიენტირებულობა.",
  "სისუფთავის მაღალი სტანდარტის დაცვა.",
  "პასუხისმგებლობის მაღალი გრძნობა და პუნქტუალურობა.",
];

const LOCATION_OPTIONS = ["ბაკურიანი", "თბილისი", "სხვა"];
const LANGUAGE_OPTIONS = ["ქართული", "ინგლისური", "რუსული"];
const MAX_CV_BYTES = 5 * 1024 * 1024;
const ACCEPTED_CV_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface FormState {
  full_name: string;
  phone: string;
  birth_date: string;
  current_location: string;
  housing_choice: "needs" | "has" | "";
  languages: string[];
  is_non_smoker: boolean;
  has_health_certificate: boolean;
  has_experience: boolean;
  last_workplace: string;
  desired_salary: string;
}

const INITIAL_FORM: FormState = {
  full_name: "",
  phone: "",
  birth_date: "",
  current_location: "",
  housing_choice: "",
  languages: ["ქართული"],
  is_non_smoker: false,
  has_health_certificate: false,
  has_experience: false,
  last_workplace: "",
  desired_salary: "",
};

export default function EmploymentDetailClient({
  service,
  isMock = false,
  applicationsCount,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const owner = service.profiles;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isMock) return;
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: (service.views_count ?? 0) + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id, isMock]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function toggleLanguage(lang: string) {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  }

  function handleCvChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_CV_MIME.includes(file.type)) {
      toast.error("მხოლოდ PDF ან DOCX ფორმატია დაშვებული");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      toast.error("ფაილის ზომა არ უნდა აღემატებოდეს 5 MB-ს");
      e.target.value = "";
      return;
    }
    setCvFile(file);
  }

  function clearCv() {
    setCvFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.full_name.trim()) next.full_name = "შეავსე სახელი და გვარი";
    if (form.phone.replace(/\D/g, "").length !== 9)
      next.phone = "შეიყვანე ვალიდური ნომერი";
    if (!form.birth_date) next.birth_date = "მიუთითე დაბადების თარიღი";
    if (!form.current_location) next.current_location = "აირჩიე ლოკაცია";
    if (!form.housing_choice) next.housing_choice = "აირჩიე ვარიანტი";
    if (!form.desired_salary.trim())
      next.desired_salary = "მიუთითე სასურველი ხელფასი";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!validate()) {
      toast.error("შეავსე ყველა აუცილებელი ველი");
      return;
    }
    if (isMock) {
      toast.success(
        "სატესტო ვაკანსიაა — რეალურ მონაცემთა ბაზაში არ ჩაიწერა, მაგრამ ფორმა მუშაობს",
      );
      setForm(INITIAL_FORM);
      clearCv();
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    let cvPath: string | null = null;
    if (cvFile) {
      const ext = cvFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${service.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("cv-documents")
        .upload(path, cvFile, {
          contentType: cvFile.type,
          upsert: false,
        });
      if (uploadError) {
        setSubmitting(false);
        toast.error("CV-ის ატვირთვა ვერ მოხერხდა");
        return;
      }
      cvPath = path;
    }

    const payload: TablesInsert<"job_applications"> = {
      service_id: service.id,
      applicant_user_id: user?.id ?? null,
      full_name: form.full_name.trim(),
      phone: `+995${form.phone}`,
      birth_date: form.birth_date || null,
      current_location: form.current_location || null,
      needs_housing: form.housing_choice === "needs",
      languages: form.languages,
      is_non_smoker: form.is_non_smoker,
      has_health_certificate: form.has_health_certificate,
      has_experience: form.has_experience,
      last_workplace: form.has_experience ? form.last_workplace.trim() : null,
      desired_salary: form.desired_salary ? Number(form.desired_salary) : null,
      cv_path: cvPath,
    };

    const { error: insertError } = await supabase
      .from("job_applications")
      .insert(payload);

    setSubmitting(false);

    if (insertError) {
      // Roll back the orphaned upload to keep the bucket clean.
      if (cvPath) {
        await supabase.storage.from("cv-documents").remove([cvPath]);
      }
      toast.error("განაცხადის გაგზავნა ვერ მოხერხდა");
      return;
    }

    toast.success("განაცხადი წარმატებით გაიგზავნა");
    setForm(INITIAL_FORM);
    clearCv();
  }

  const inputBase =
    "h-11 w-full rounded-[12px] border bg-white px-3 text-sm outline-none transition-colors focus:border-[#2563EB]";
  const inputClass = (key: keyof FormState) =>
    `${inputBase} ${errors[key as string] ? "border-[#EF4444]" : "border-[#E2E8F0]"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-[88px] sm:py-8 md:pb-8">
      <div className="mb-6 flex items-center justify-between">
        <motion.button
          {...fadeIn}
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
        >
          <ArrowLeft className="h-4 w-4" />
          უკან ძიებაზე
        </motion.button>
        <motion.div
          {...fadeIn}
          className="flex items-center gap-1.5 text-[12px] font-medium text-[#94A3B8]"
        >
          <ClockIcon className="h-3.5 w-3.5" />
          გამოქვეყნდა: დღეს
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-black text-[#16A34A]">
              <Leaf className="h-3.5 w-3.5" />
              სასწრაფო
            </span>
            {service.is_vip && (
              <span className="inline-flex items-center rounded-md bg-[#FEF3C7] px-2.5 py-1 text-[12px] font-black text-[#92400E]">
                VIP
              </span>
            )}
          </motion.div>

          <motion.h1
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="text-[36px] font-black leading-[44px] text-[#0F172A] sm:text-[44px] sm:leading-[52px]"
          >
            {service.title}
          </motion.h1>

          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mt-5 flex flex-wrap items-center gap-3"
          >
            <span className="inline-flex items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-3 py-2 text-[14px] font-bold text-[#1E293B]">
              <Building2 className="h-4 w-4 text-[#2563EB]" />
              {owner?.display_name ?? "Crystal Resort Management"}
              {(owner?.is_verified ?? true) && (
                <BadgeCheck className="h-4 w-4 fill-[#22C55E] text-white" />
              )}
            </span>
            <span className="text-[#CBD5E1]">·</span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
              <Users className="h-4 w-4" />
              {applicationsCount} გამოხმაურება
            </span>
          </motion.div>

          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <StatCard
              icon={<MapPin />}
              label="ლოკაცია"
              value={service.location ?? "დიდველი"}
            />
            <StatCard
              icon={<Banknote />}
              label="ანაზღაურება"
              value={
                service.salary_range ??
                (service.salary_daily
                  ? `${service.salary_daily} ₾ / დღეში`
                  : "60 ₾ / დღეში")
              }
              accent
            />
            <StatCard
              icon={<ClockIcon />}
              label="გრაფიკი"
              value={service.employment_schedule ?? "მოქნილი"}
              subtext="(გამოდახებით)"
            />
            <StatCard
              icon={<Briefcase />}
              label="გამოცდილება"
              value={service.experience_required ?? "სასურველია"}
            />
          </motion.div>

          {service.description && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-8"
            >
              <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
                სამუშაოს აღწერა
              </h2>
              <p className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
                {service.description}
              </p>
            </motion.div>
          )}

          <motion.div
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-8"
          >
            <h2 className="mb-4 text-[20px] font-black leading-[30px] text-[#0F172A]">
              მოთხოვნები და კომპეტენციები
            </h2>
            <ul className="space-y-3">
              {REQUIREMENTS.map((req) => (
                <li key={req} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />
                  <span className="text-[14px] font-medium text-[#475569]">
                    {req}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          {(owner?.is_verified ?? true) && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-8 rounded-[16px] border border-[#A7F3D0] bg-[#ECFDF5] p-5"
            >
              <p className="mb-1 text-[15px] font-black text-[#0F766E]">
                ვერიფიცირებული დამსაქმებელი
              </p>
              <p className="text-[13px] leading-[20px] text-[#475569]">
                აღნიშნულ კომპანიას გავლილი აქვს იდენტიფიკაცია MyBakuriani-ს
                მიერ, რაც უზრუნველყოფს სანდო და უსაფრთო სამუშაო გარემოს.
              </p>
            </motion.div>
          )}

          {/* Application form */}
          <motion.div
            id="contact-sidebar"
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="mt-10 rounded-[24px] border border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC] to-white p-6 sm:p-8"
          >
            <h2 className="mb-2 text-center text-[28px] font-black text-[#1E293B] sm:text-[32px]">
              გამოეხმაურე ვაკანსიას
            </h2>
            <p className="mb-6 text-center text-[13px] text-[#64748B]">
              შეავსეთ ფორმა მარტივად, პირდაპირ საიტიდან
            </p>

            {/* CV upload */}
            <label
              htmlFor="cv-upload"
              className="mb-6 block cursor-pointer rounded-[16px] border-2 border-dashed border-[#BFDBFE] bg-[#F0F7FF] p-8 text-center transition-colors hover:border-[#2563EB]"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#DBEAFE] text-[#2563EB]">
                <Upload className="h-5 w-5" />
              </div>
              {cvFile ? (
                <>
                  <p className="text-[14px] font-black text-[#1E293B]">
                    <FileText className="mr-1.5 inline h-4 w-4" />
                    {cvFile.name}
                  </p>
                  <p className="mt-1 text-[12px] text-[#64748B]">
                    {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      clearCv();
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#EF4444] hover:underline"
                  >
                    <X className="h-3 w-3" />
                    წაშლა
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[16px] font-black text-[#1E293B]">
                    ატვირთეთ რეზიუმე (CV)
                  </p>
                  <p className="mt-1 text-[12px] text-[#64748B]">
                    PDF ან DOCX ფორმატი (არ არის სავალდებულო)
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-3 py-1 text-[11px] font-bold text-[#16A34A]">
                    💡 CV-ის ატვირთვისას დამსაქმებლის დაინტერესება ბევრად
                    მაღალია
                  </span>
                </>
              )}
              <input
                ref={fileInputRef}
                id="cv-upload"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleCvChange}
              />
            </label>

            <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[1px] text-[#94A3B8]">
              <span className="h-px flex-1 bg-[#E2E8F0]" />
              ან შეავსეთ დეტალები
              <span className="h-px flex-1 bg-[#E2E8F0]" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                  სახელი და გვარი <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  className={inputClass("full_name")}
                  placeholder="მაგ: მარიამ გიორგაძე"
                />
                {errors.full_name && (
                  <p className="mt-1 text-xs text-[#EF4444]">
                    {errors.full_name}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                  ტელეფონის ნომერი <span className="text-[#EF4444]">*</span>
                </label>
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => update("phone", v)}
                  error={errors.phone}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                  დაბადების თარიღი (ასაკი){" "}
                  <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => update("birth_date", e.target.value)}
                  className={inputClass("birth_date")}
                />
                {errors.birth_date && (
                  <p className="mt-1 text-xs text-[#EF4444]">
                    {errors.birth_date}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                  ამჟამინდელი ლოკაცია <span className="text-[#EF4444]">*</span>
                </label>
                <select
                  value={form.current_location}
                  onChange={(e) => update("current_location", e.target.value)}
                  className={inputClass("current_location")}
                >
                  <option value="">აირჩიეთ ლოკაცია</option>
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                {errors.current_location && (
                  <p className="mt-1 text-xs text-[#EF4444]">
                    {errors.current_location}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 text-[13px] font-bold text-[#1E293B]">
                  საცხოვრებელი ლოკაციაზე{" "}
                  <span className="text-[#EF4444]">*</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "needs", label: "მჭირდება საცხოვრებელი" },
                    { value: "has", label: "მაქვს ჩემი ფართი ბაკურიანში" },
                  ].map((opt) => {
                    const active = form.housing_choice === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 text-[13px] font-medium transition-colors ${
                          active
                            ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E293B]"
                            : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="housing_choice"
                          value={opt.value}
                          checked={active}
                          onChange={() =>
                            update(
                              "housing_choice",
                              opt.value as FormState["housing_choice"],
                            )
                          }
                          className="sr-only"
                        />
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            active ? "border-[#2563EB]" : "border-[#CBD5E1]"
                          }`}
                        >
                          {active && (
                            <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                          )}
                        </span>
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
                {errors.housing_choice && (
                  <p className="mt-1 text-xs text-[#EF4444]">
                    {errors.housing_choice}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 text-[13px] font-bold text-[#1E293B]">
                  ენები <span className="text-[#EF4444]">*</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const checked = form.languages.includes(lang);
                    return (
                      <label
                        key={lang}
                        className={`flex cursor-pointer items-center gap-2 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium transition-colors ${
                          checked
                            ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E293B]"
                            : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLanguage(lang)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-2 ${
                            checked
                              ? "border-[#2563EB] bg-[#2563EB]"
                              : "border-[#CBD5E1] bg-white"
                          }`}
                        >
                          {checked && (
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          )}
                        </span>
                        {lang}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="mb-2 text-[13px] font-bold text-[#1E293B]">
                  დამატებითი ინფორმაცია
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    {
                      key: "is_non_smoker" as const,
                      label: "არამწეველი",
                    },
                    {
                      key: "has_health_certificate" as const,
                      label: "ჯანმრთელობის ცნობა",
                    },
                    {
                      key: "has_experience" as const,
                      label: "სამუშაო გამოცდილება",
                    },
                  ].map((opt) => {
                    const checked = form[opt.key];
                    return (
                      <label
                        key={opt.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium transition-colors ${
                          checked
                            ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E293B]"
                            : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => update(opt.key, e.target.checked)}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-2 ${
                            checked
                              ? "border-[#2563EB] bg-[#2563EB]"
                              : "border-[#CBD5E1] bg-white"
                          }`}
                        >
                          {checked && (
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          )}
                        </span>
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {form.has_experience && (
                <div>
                  <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                    ბოლო სამუშაო ადგილი{" "}
                    <span className="text-[12px] font-medium text-[#94A3B8]">
                      (გამოცდილების შემთხვევაში)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.last_workplace}
                    onChange={(e) => update("last_workplace", e.target.value)}
                    className={inputClass("last_workplace")}
                    placeholder="მაგ: სასტუმრო რუმსი..."
                  />
                </div>
              )}

              <div className={form.has_experience ? "" : "sm:col-span-2"}>
                <label className="mb-1.5 block text-[13px] font-bold text-[#1E293B]">
                  სასურველი ხელფასი{" "}
                  <span className="text-[12px] font-medium text-[#94A3B8]">
                    (თუ შეთანხმებითია)
                  </span>{" "}
                  <span className="text-[#EF4444]">*</span>
                </label>
                <div
                  className={`flex h-11 items-center overflow-hidden rounded-[12px] border bg-white transition-colors focus-within:border-[#2563EB] ${
                    errors.desired_salary
                      ? "border-[#EF4444]"
                      : "border-[#E2E8F0]"
                  }`}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="50"
                    value={form.desired_salary}
                    onChange={(e) => update("desired_salary", e.target.value)}
                    className="h-full w-full bg-transparent px-3 text-sm outline-none"
                    placeholder="მაგ: 1500"
                  />
                  <span className="px-3 text-sm font-bold text-[#94A3B8]">
                    ₾
                  </span>
                </div>
                {errors.desired_salary && (
                  <p className="mt-1 text-xs text-[#EF4444]">
                    {errors.desired_salary}
                  </p>
                )}
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-6 h-12 w-full gap-2 rounded-[12px] bg-[#2563EB] text-[15px] font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "იგზავნება..." : "მონაცემების გაგზავნა"}
            </Button>
          </motion.div>
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="space-y-4"
        >
          <div className="sticky top-24 rounded-[20px] border border-[#E2E8F0] bg-white p-6">
            <h3 className="mb-5 text-[18px] font-black text-[#0F172A]">
              დამატებითი პირობები
            </h3>
            <dl className="divide-y divide-[#E2E8F0]">
              <SidebarRow
                label="ანაზღაურების მოდელი"
                value={salaryModelLabel(service.salary_type)}
              />
              <SidebarRow
                label="საცხოვრებელი"
                value={service.accommodation ?? "კი"}
              />
              <SidebarRow
                label="კვება"
                value={service.meals ?? "1-ჯერადი კვება"}
              />
              <div className="pt-4">
                <dt className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
                  სასურველი ენები
                </dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {(service.languages?.length
                    ? service.languages
                    : ["ქართული", "რუსული"]
                  ).map((lang) => (
                    <span
                      key={lang}
                      className="rounded-[8px] border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-bold text-[#475569]"
                    >
                      {lang}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </div>
        </motion.aside>
      </div>

      <MobileStickyCTA
        primary={service.salary_range ?? service.title}
        secondary={service.location ?? undefined}
        ctaLabel="განაცხადი"
        onClick={() =>
          document
            .getElementById("contact-sidebar")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        ctaClassName="shrink-0 rounded-xl bg-[#2563EB] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
      />
    </div>
  );
}
