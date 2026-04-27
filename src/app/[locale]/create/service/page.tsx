"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Clock, ImageIcon } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhoneInput from "@/components/forms/PhoneInput";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const SERVICE_SPHERES = [
  { value: "cleaning", label: "დასუფთავება / დამლაგებელი" },
  { value: "plumbing", label: "სანტექნიკა / გათბობის ქვები" },
  { value: "electrical", label: "ელექტრობა" },
  { value: "locksmith", label: "საკეტები" },
  { value: "appliance_repair", label: "ტექნიკის შეკეთება" },
  { value: "handyman", label: "ხელოსანი" },
  { value: "other", label: "სხვა" },
] as const;

type SphereValue = (typeof SERVICE_SPHERES)[number]["value"];

const COVERAGE_ZONES = ["მთლიანი ბაკურიანი", "მიტარბი", "წალვერი"] as const;
const LANGUAGES = ["ქართული", "ინგლისური", "რუსული"] as const;

export default function CreateServicePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [sphere, setSphere] = useState<SphereValue>("cleaning");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [coverageZones, setCoverageZones] = useState<string[]>([
    "მთლიანი ბაკურიანი",
    "მიტარბი",
  ]);
  const [languages, setLanguages] = useState<string[]>(["ქართული", "რუსული"]);
  const [description, setDescription] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00 - 19:00");
  const [is24_7, setIs24_7] = useState(false);
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const requiredFilled = [
    name.trim().length > 0,
    experienceYears.trim().length > 0,
    !!sphere,
    !!profilePhoto,
    coverageZones.length > 0,
    description.trim().length > 0,
    is24_7 || workingHours.trim().length > 0,
    price.trim().length > 0,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 9) * 100));

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

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const categoryValue: "cleaning" | "handyman" =
        sphere === "cleaning" ? "cleaning" : "handyman";

      const insertPayload: Record<string, unknown> = {
        owner_id: user.id,
        category: categoryValue,
        title: name.trim(),
        description: description.trim() || null,
        price: price ? Number(price) : null,
        price_unit: "საათი",
        schedule: is24_7 ? "24/7" : workingHours.trim() || null,
        operating_hours: is24_7 ? "24/7" : workingHours.trim() || null,
        location: coverageZones.join(", ") || null,
        experience_required: experienceYears ? `${experienceYears} წელი` : null,
        photos: profilePhoto ? [profilePhoto] : [],
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        status: "pending",
      };

      const { error: insertError } = await supabase
        .from("services")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any);

      if (insertError) throw insertError;
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled =
    !name.trim() ||
    !experienceYears.trim() ||
    !profilePhoto ||
    coverageZones.length === 0 ||
    !description.trim() ||
    (!is24_7 && !workingHours.trim()) ||
    !price.trim() ||
    !phone.trim();

  return (
    <WizardShell
      title="სერვისები და ხელოსნები"
      accent="blue"
      progressPercent={progressPercent}
      footer={
        <WizardFooter
          accent="blue"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={submitDisabled}
          loading={loading}
          error={error}
        />
      }
    >
      {/* Section 1 — Sphere & Profile */}
      <WizardInnerCard number={1} title="სფერო და პროფილი" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="სახელი / კომპანია" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ნინო"
              className={inputClass}
            />
          </Field>
          <Field label="გამოცდილება" required>
            <input
              type="text"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              placeholder="8 წელი"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="მომსახურების სფერო" required>
          <StyledSelect
            value={sphere}
            onValueChange={(v) => setSphere(v as SphereValue)}
            options={SERVICE_SPHERES}
            accent="blue"
          />
        </Field>

        <ProfilePhotoUpload value={profilePhoto} onChange={setProfilePhoto} />
      </WizardInnerCard>

      {/* Section 2 — Details & Description */}
      <WizardInnerCard number={2} title="დეტალები და აღწერა" accent="blue">
        <Field label="დაფარვის ზონა" required uppercase>
          <div className="flex flex-wrap gap-2">
            {COVERAGE_ZONES.map((zone) => (
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

        <Field label="სასაუბრო ენები" uppercase>
          <div className="flex flex-wrap gap-3">
            {LANGUAGES.map((lang) => (
              <LanguageChip
                key={lang}
                selected={languages.includes(lang)}
                onClick={() => toggleLanguage(lang)}
              >
                {lang}
              </LanguageChip>
            ))}
          </div>
        </Field>

        <Field label="დეტალური აღწერა" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ვასუფთავებ როგორც აპარტამენტებს, ისე კერძო კოტეჯებს..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>
      </WizardInnerCard>

      {/* Section 3 — Schedule, Price & Contact */}
      <WizardInnerCard
        number={3}
        title="გრაფიკი, ფასი და კონტაქტი"
        accent="blue"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="სამუშაო საათები" required uppercase>
            <input
              type="text"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="09:00 - 19:00"
              disabled={is24_7}
              className={cn(inputClass, is24_7 && "opacity-60")}
            />
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setIs24_7((v) => !v)}
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
                  24/7 რეჟიმი
                </span>
                <span className="block text-xs font-medium text-[#64748B]">
                  მუშაობს ღამითაც
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

        <Field label="საწყისი ფასი / ტარიფი" required uppercase>
          <div className="relative">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="50"
              min="0"
              className={cn(inputClass, "pr-14")}
            />
            <span className="pointer-events-none absolute inset-y-1.5 right-1.5 flex w-11 items-center justify-center rounded-lg bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
              ₾
            </span>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ტელეფონის ნომერი" required uppercase>
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="WhatsApp ნომერი" uppercase>
            <PhoneInput value={whatsapp} onChange={setWhatsapp} />
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
  uppercase,
  children,
}: {
  label: string;
  required?: boolean;
  uppercase?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        className={cn(
          "block text-[13px] font-bold text-[#334155]",
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
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex size-[88px] shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors",
          value
            ? "border-[#2563EB] bg-white"
            : "border-[#93C5FD] bg-[#EFF6FF] hover:border-[#2563EB]",
        )}
        aria-label="ატვირთეთ პროფილის ფოტო"
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
        <p className="text-sm font-bold text-[#0F172A]">პროფილის ფოტო</p>
        <p className="mt-0.5 text-xs font-medium text-[#64748B]">
          ატვირთეთ თქვენი ან კომპანიის ლოგოს ფოტო (სავალდებულოა)
        </p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-1.5 text-xs font-semibold text-[#EF4444] hover:underline"
          >
            წაშლა
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
