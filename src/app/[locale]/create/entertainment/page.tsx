"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { cn } from "@/lib/utils";

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
  { value: "buggy", label: "ბაგი" },
  { value: "other", label: "სხვა" },
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
type Duration = (typeof DURATIONS)[number]["value"];
type Age = (typeof AGES)[number]["value"];
type GoodFor = (typeof GOOD_FOR)[number]["value"];
type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

const MAX_PHOTOS = 5;

// Stored values are the Georgian labels, so hydration reverse-maps label → value.
function findValueByLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  label: string | null | undefined,
): T | null {
  if (!label) return null;
  return options.find((o) => o.label === label)?.value ?? null;
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError("განცხადება ვერ მოიძებნა");
        setHydrating(false);
        return;
      }

      setTitle(data.title ?? "");
      setDescription(data.description ?? "");

      const at = findValueByLabel(ACTIVITY_TYPES, data.activity_type);
      if (at) setActivityType(at);
      const cat = findValueByLabel(ACTIVITY_CATEGORIES, data.activity_category);
      if (cat) setCategory(cat);
      const dur = findValueByLabel(DURATIONS, data.duration);
      if (dur) setDuration(dur);
      const age = findValueByLabel(AGES, data.age_min);
      if (age) setAgeMin(age);
      const gf = findValueByLabel(GOOD_FOR, data.good_for);
      if (gf) setGoodFor(gf);
      const pu = findValueByLabel(PRICE_UNITS, data.price_unit);
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
  }, [editId, user, supabase]);

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
        schedule: workingHours.trim() || null,
        operating_hours: workingHours.trim() || null,
        location: [zone, exactLocation.trim()].filter(Boolean).join(" • "),
        coords: coords ?? null,
        photos,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("services")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(payload as any)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("services")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...payload, owner_id: user.id, status: "pending" } as any);

        if (insertError) throw insertError;
      }

      router.push(editId ? "/dashboard/service" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
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
      title="გართობა და აქტივობები"
      subtitle="ტურიზმი, ტურები და ინვენტარის გაქირავება"
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
              onValueChange={(v) => setZone(v)}
              options={zoneOptions}
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

        <Field label="უსაფრთხოება და პირობები">
          <textarea
            value={safetyNotes}
            onChange={(e) => setSafetyNotes(e.target.value)}
            placeholder="მაგ: ჩაიცვით შესაბამისი დასაცავი აღჭურვილობა, ტურს ახლავს პროფესიონალი ინსტრუქტორი"
            rows={3}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </Field>
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
