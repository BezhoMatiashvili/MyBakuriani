"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ExactLocationPicker = dynamic(
  () => import("@/components/maps/ExactLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full animate-pulse rounded-xl bg-[#E2E8F0]" />
    ),
  },
);

const ACTIVITY_TYPES = [
  { value: "extreme", label: "ექსტრემალური" },
  { value: "sport", label: "სპორტული" },
  { value: "kids", label: "ბავშვებისთვის" },
  { value: "family", label: "ოჯახისთვის" },
  { value: "other", label: "სხვა" },
] as const;

const ACTIVITY_CATEGORIES = [
  { value: "inventory_rent", label: "ინვენტარი" },
  { value: "horses", label: "ცხენები" },
  { value: "buggies", label: "ბურანები" },
  { value: "quad_bikes", label: "კვადროციკლები" },
  { value: "other", label: "სხვა" },
] as const;

const ZONES = [
  { value: "დიდველი", label: "დიდველი" },
  { value: "კოხტა", label: "კოხტა" },
  { value: "25-იანები", label: "25-იანები" },
] as const;

const DURATIONS = [
  { value: "15min", label: "15 წუთი" },
  { value: "30min", label: "30 წუთი" },
  { value: "1h", label: "1 საათი" },
  { value: "1h+", label: "1+ საათი" },
] as const;

const AGES = [
  { value: "any", label: "ნებისმიერი" },
  { value: "12+", label: "12+" },
  { value: "16+", label: "16+" },
] as const;

const GOOD_FOR = [
  { value: "all", label: "ყველასთვის" },
  { value: "extreme_lovers", label: "ექსტრემის მოყვარულთა" },
] as const;

const PRICE_UNITS = [
  { value: "15min", label: "15 წუთზე" },
  { value: "1h", label: "1 საათზე" },
  { value: "full_day", label: "სრულ დღეზე" },
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];
type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["value"];
type Zone = (typeof ZONES)[number]["value"];
type Duration = (typeof DURATIONS)[number]["value"];
type Age = (typeof AGES)[number]["value"];
type GoodFor = (typeof GOOD_FOR)[number]["value"];
type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

const MAX_PHOTOS = 5;

export default function CreateEntertainmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("extreme");
  const [category, setCategory] = useState<ActivityCategory>("buggies");
  const [zone, setZone] = useState<Zone>("დიდველი");
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

  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("1h");
  const [photos, setPhotos] = useState<string[]>([]);

  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const requiredFilled = [
    title.trim().length > 0,
    description.trim().length > 0,
    price.trim().length > 0,
    photos.length > 0,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 5) * 100));

  const submitDisabled =
    !title.trim() ||
    !description.trim() ||
    !price.trim() ||
    photos.length === 0 ||
    !phone.trim();

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const activityTypeLabel = ACTIVITY_TYPES.find(
        (t) => t.value === activityType,
      )?.label;
      const categoryLabel = ACTIVITY_CATEGORIES.find(
        (c) => c.value === category,
      )?.label;
      const durationLabel = DURATIONS.find((d) => d.value === duration)?.label;
      const ageLabel = AGES.find((a) => a.value === ageMin)?.label;
      const goodForLabel = GOOD_FOR.find((g) => g.value === goodFor)?.label;
      const priceUnitLabel = PRICE_UNITS.find(
        (p) => p.value === priceUnit,
      )?.label;

      const attrLine = [
        activityTypeLabel && `ტიპი: ${activityTypeLabel}`,
        categoryLabel && `კატეგორია: ${categoryLabel}`,
        durationLabel && `ხანგრძლივობა: ${durationLabel}`,
        ageLabel && `ასაკი: ${ageLabel}`,
        goodForLabel && `ვისთვის: ${goodForLabel}`,
      ]
        .filter(Boolean)
        .join(" • ");

      const fullDescription = [attrLine, description.trim()]
        .filter(Boolean)
        .join("\n\n");

      const insertPayload: Record<string, unknown> = {
        owner_id: user.id,
        category: "entertainment",
        title: title.trim(),
        description: fullDescription || null,
        price: price ? Number(price) : null,
        price_unit: priceUnitLabel || null,
        schedule: workingHours.trim() || null,
        operating_hours: workingHours.trim() || null,
        location: [zone, exactLocation.trim()].filter(Boolean).join(" • "),
        photos,
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

  return (
    <WizardShell
      title="გართობა და აქტივობები"
      subtitle="ტურიზმი, ტურები და ინვენტარის გაქირავება"
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
      {/* Section 1 — Basic info */}
      <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
        <Field label="სათაური" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ექსტრემალური ტური თოვლის ბურანით"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="გართობის ტიპი" required>
            <StyledSelect
              value={activityType}
              onValueChange={(v) => setActivityType(v as ActivityType)}
              options={ACTIVITY_TYPES}
              accent="blue"
            />
          </Field>
          <Field label="კატეგორია" required>
            <StyledSelect
              value={category}
              onValueChange={(v) => setCategory(v as ActivityCategory)}
              options={ACTIVITY_CATEGORIES}
              accent="blue"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ზონა / ტრასა" required>
            <StyledSelect
              value={zone}
              onValueChange={(v) => setZone(v as Zone)}
              options={ZONES}
              accent="blue"
            />
          </Field>
          <Field label="ზუსტი ლოკაცია">
            <div className="flex gap-2">
              <input
                type="text"
                value={exactLocation}
                onChange={(e) => setExactLocation(e.target.value)}
                placeholder="მაგ: ცენტრალური პარკის შესასვლელთან"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                className="flex size-[48px] shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8]"
                aria-label="რუკაზე არჩევა"
                aria-pressed={showMap}
              >
                <MapPin className="size-5" />
              </button>
            </div>
          </Field>
        </div>

        {showMap && <ExactLocationPicker value={coords} onChange={setCoords} />}

        <Field label="აღწერა (რას გთავაზობთ)" required>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="დაუვიწყარი 1 საათიანი ექსტრემალური ტური დიდველის დათოვლილ ტყეში..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>
      </WizardInnerCard>

      {/* Section 2 — Attributes */}
      <WizardInnerCard number={2} title="მახასიათებლები" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field label="ხანგრძლივობა">
            <StyledSelect
              value={duration}
              onValueChange={(v) => setDuration(v as Duration)}
              options={DURATIONS}
              accent="blue"
            />
          </Field>
          <Field label="ასაკი">
            <StyledSelect
              value={ageMin}
              onValueChange={(v) => setAgeMin(v as Age)}
              options={AGES}
              accent="blue"
            />
          </Field>
          <Field label="ვისთვის არის">
            <StyledSelect
              value={goodFor}
              onValueChange={(v) => setGoodFor(v as GoodFor)}
              options={GOOD_FOR}
              accent="blue"
            />
          </Field>
          <Field label="სამუშაო საათები">
            <input
              type="text"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="10:00 - 18:00"
              className={inputClass}
            />
          </Field>
        </div>
      </WizardInnerCard>

      {/* Section 3 — Tariff */}
      <WizardInnerCard number={3} title="ტარიფი" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ტარიფი (GEL)" required>
            <div className="relative">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="100"
                min="0"
                className={cn(inputClass, "pr-14")}
              />
              <span className="pointer-events-none absolute inset-y-1.5 right-1.5 flex w-11 items-center justify-center rounded-lg bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
                ₾
              </span>
            </div>
          </Field>
          <Field label="ფასი მოცემულია" required>
            <StyledSelect
              value={priceUnit}
              onValueChange={(v) => setPriceUnit(v as PriceUnit)}
              options={PRICE_UNITS}
              accent="blue"
            />
          </Field>
        </div>

        <Field label="ფოტოების ატვირთვა" required>
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={MAX_PHOTOS}
            variant="figma"
          />
        </Field>
      </WizardInnerCard>

      {/* Section 4 — Contact */}
      <WizardInnerCard number={4} title="კონტაქტი" accent="blue">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ტელეფონი" required>
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="WhatsApp">
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
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-bold text-[#334155]">
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}
