"use client";

import { useRef, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, MapPin, X } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";
import { createClient } from "@/lib/supabase/client";

const RESTAURANT_TYPES = [
  { value: "restaurant", label: "რესტორანი" },
  { value: "cafe", label: "კაფე / საკონდიტრო" },
  { value: "bar", label: "ბარი / პაბი" },
  { value: "fast_food", label: "სწრაფი კვება" },
  { value: "other", label: "სხვა" },
];

const CUISINE_TYPES = [
  { value: "georgian", label: "ქართული" },
  { value: "european", label: "ევროპული" },
  { value: "asian", label: "აზიური" },
  { value: "mixed", label: "შერეული" },
];

const AVG_CHECK_OPTIONS = [
  { value: "10-30", label: "10-30 ₾" },
  { value: "30-60", label: "30-60 ₾" },
  { value: "60-100", label: "60-100 ₾" },
  { value: "100+", label: "100 ₾+" },
];

const ZONE_OPTIONS = SEARCH_LOCATION_ZONES.map((z) => ({ value: z, label: z }));

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 10;

export default function CreateFoodPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [restaurantType, setRestaurantType] = useState("restaurant");
  const [cuisineType, setCuisineType] = useState("");
  const [zone, setZone] = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [avgCheck, setAvgCheck] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [hasKidsArea, setHasKidsArea] = useState(false);
  const [hasLounge, setHasLounge] = useState(false);
  const [hasDelivery, setHasDelivery] = useState(false);
  const [hasLiveMusic, setHasLiveMusic] = useState(false);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [menuUrlInput, setMenuUrlInput] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const menuFileRef = useRef<HTMLInputElement>(null);

  function onPickMenuFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("მენიუ უნდა იყოს PDF ფაილი");
      return;
    }
    setMenuFile(file);
    setMenuUrlInput("");
    setError(null);
  }

  async function uploadMenuPdf(): Promise<string | null> {
    if (!menuFile || !user) return null;
    const ext = "pdf";
    const path = `menus/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("property-photos")
      .upload(path, menuFile, { contentType: "application/pdf" });
    if (upErr) throw upErr;
    const { data } = supabase.storage
      .from("property-photos")
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      if (!title.trim()) throw new Error("შეავსეთ ობიექტის დასახელება");
      if (!zone) throw new Error("აირჩიეთ ლოკაცია");
      if (!avgCheck) throw new Error("აირჩიეთ საშუალო ჩეკი");
      if (!operatingHours.trim()) throw new Error("მიუთითეთ სამუშაო საათები");
      if (photos.length < MIN_PHOTOS) {
        throw new Error(`მინიმუმ ${MIN_PHOTOS} ფოტო აუცილებელია`);
      }

      let menuUrl: string | null = null;
      if (menuFile) {
        menuUrl = await uploadMenuPdf();
      } else if (menuUrlInput.trim()) {
        menuUrl = menuUrlInput.trim();
      }

      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "food",
        title: title.trim(),
        cuisine_type: cuisineType || null,
        avg_check: avgCheck,
        menu_url: menuUrl,
        has_kids_area: hasKidsArea,
        has_lounge: hasLounge,
        has_delivery: hasDelivery,
        has_live_music: hasLiveMusic,
        operating_hours: operatingHours.trim() || null,
        location: zone || exactLocation.trim() || null,
        photos,
        status: "pending",
      });

      if (insertError) throw insertError;
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  const requiredFilled = [
    title.trim().length > 0,
    zone.length > 0,
    avgCheck.length > 0,
    operatingHours.trim().length > 0,
    photos.length >= MIN_PHOTOS,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 5) * 100));

  const submitDisabled =
    !title.trim() ||
    !zone ||
    !avgCheck ||
    !operatingHours.trim() ||
    photos.length < MIN_PHOTOS;

  return (
    <WizardShell
      title="კვება და რესტორნები"
      accent="orange"
      progressPercent={progressPercent}
      footer={
        <WizardFooter
          accent="orange"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={submitDisabled}
          loading={loading}
          error={error}
        />
      }
    >
      <div className="space-y-8">
        {/* Section 1 — Basic info */}
        <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="orange">
          <Field label="ობიექტის დასახელება" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="მაგ: რესტორანი პანორამა"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="რესტორნის ტიპი" required>
              <StyledSelect
                value={restaurantType}
                onValueChange={setRestaurantType}
                options={RESTAURANT_TYPES}
                accent="orange"
              />
            </Field>
            <Field label="სამზარეულოს ტიპი">
              <StyledSelect
                value={cuisineType}
                onValueChange={setCuisineType}
                options={CUISINE_TYPES}
                placeholder="აირჩიეთ ტიპი"
                accent="orange"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="ლოკაცია (ZONE)" required>
              <StyledSelect
                value={zone}
                onValueChange={setZone}
                options={ZONE_OPTIONS}
                placeholder="აირჩიეთ ზონა"
                accent="orange"
              />
            </Field>
            <Field label="ზუსტი ლოკაცია">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={exactLocation}
                  onChange={(e) => setExactLocation(e.target.value)}
                  placeholder="მაგ: ცენტრალური პარკის შესასვლელთან"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#F97316] text-white shadow-[0px_4px_10px_rgba(249,115,22,0.25)] transition-colors hover:bg-[#EA580C]"
                  aria-label="რუკაზე ჩვენება"
                >
                  <MapPin className="size-5" strokeWidth={2.25} />
                </button>
              </div>
            </Field>
          </div>
        </WizardInnerCard>

        {/* Section 2 — Details & services */}
        <WizardInnerCard
          number={2}
          title="დეტალები და სერვისები"
          accent="orange"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="საშუალო ჩეკი 1 პერსონაზე" required>
              <StyledSelect
                value={avgCheck}
                onValueChange={setAvgCheck}
                options={AVG_CHECK_OPTIONS}
                placeholder="აირჩიეთ ფასი"
                accent="orange"
              />
            </Field>
            <Field label="სამუშაო საათები" required>
              <input
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                placeholder="მაგ: 10:00 - 20:00"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[#334155]">
              დამატებითი დეტალები
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <ServiceCheckbox
                label="საბავშვო სივრცე"
                checked={hasKidsArea}
                onChange={setHasKidsArea}
              />
              <ServiceCheckbox
                label="მოსაწვევი ზონა"
                checked={hasLounge}
                onChange={setHasLounge}
              />
              <ServiceCheckbox
                label="მიტანის სერვისი"
                checked={hasDelivery}
                onChange={setHasDelivery}
              />
              <ServiceCheckbox
                label="ცოცხალი მუსიკა"
                checked={hasLiveMusic}
                onChange={setHasLiveMusic}
              />
            </div>
          </div>
        </WizardInnerCard>

        {/* Section 3 — Menu & photos */}
        <WizardInnerCard number={3} title="მენიუ და ფოტოები" accent="orange">
          <Field label="მენიუ (არასავალდებულო)">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => menuFileRef.current?.click()}
                className="flex h-[68px] items-center gap-3 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-left transition-colors hover:border-[#F97316] hover:bg-[#FFF7ED]"
              >
                <FileText className="size-6 shrink-0 text-[#F97316]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[#334155]">
                    {menuFile ? menuFile.name : "მენიუს ატვირთვა"}
                  </div>
                  <div className="text-xs text-[#94A3B8]">მხოლოდ PDF ფაილი</div>
                </div>
                {menuFile && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFile(null);
                      if (menuFileRef.current) menuFileRef.current.value = "";
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                    aria-label="წაშლა"
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
                  placeholder="ან ვებ-გვერდის ბმული (URL)..."
                  className={`${inputClass} pl-10`}
                />
              </div>
            </div>
          </Field>

          <Field
            label="ობიექტის ფოტოები"
            required
            chip={{ label: `მინიმუმ ${MIN_PHOTOS} ფოტო`, variant: "orange" }}
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
      </div>
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
      className={`flex h-[52px] cursor-pointer items-center gap-2.5 rounded-xl border px-4 transition-colors ${
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
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  chip?: { label: string; variant?: "green" | "blue" | "orange" };
  chipPosition?: "inline" | "end";
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-[13px] font-bold text-[#334155]">
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
