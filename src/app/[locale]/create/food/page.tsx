"use client";

import { Suspense, useEffect, useRef, useState, ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Link2, MapPin, X } from "lucide-react";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { StyledSelect } from "@/components/ui/styled-select";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import {
  FOOD_AMENITIES,
  type FoodAmenityKey,
  RESTAURANT_TYPES,
  CUISINE_TYPES,
  AVG_CHECK_OPTIONS,
} from "@/lib/constants/listing-options";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 10;

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
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(isEditMode);

  const [title, setTitle] = useState("");
  const [restaurantType, setRestaurantType] = useState("restaurant");
  const [cuisineType, setCuisineType] = useState("");
  const [zone, setZone] = useState("");
  const [exactLocation, setExactLocation] = useState("");
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
  const [whatsapp, setWhatsapp] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const menuFileRef = useRef<HTMLInputElement>(null);

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
      // `whatsapp` exists on services (migration 20260427130000) but the
      // generated types are stale — read it through a narrow cast.
      setWhatsapp(
        stripPrefix((data as { whatsapp?: string | null }).whatsapp ?? null),
      );
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
      setError("მენიუ უნდა იყოს PDF ფაილი");
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
      throw new Error(`მენიუს ატვირთვა ვერ მოხერხდა: ${upErr.message}`);
    const { data } = supabase.storage
      .from("restaurant-menus")
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
      if (!phone.trim()) throw new Error("მიუთითეთ ტელეფონის ნომერი");
      if (photos.length < MIN_PHOTOS) {
        throw new Error(`მინიმუმ ${MIN_PHOTOS} ფოტო აუცილებელია`);
      }

      let menuUrl: string | null = null;
      if (menuFile) {
        menuUrl = await uploadMenuPdf();
      } else if (menuUrlInput.trim()) {
        menuUrl = menuUrlInput.trim();
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
        avg_check: avgCheck,
        menu_url: menuUrl,
        ...amenities,
        operating_hours: operatingHours.trim() || null,
        location: zone || exactLocation.trim() || null,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        photos,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("services")
          .update(payload)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        router.push("/dashboard/food");
      } else {
        const { error: insertError } = await supabase.from("services").insert({
          ...payload,
          owner_id: user.id,
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

  const requiredFilled = [
    title.trim().length > 0,
    zone.length > 0,
    avgCheck.length > 0,
    operatingHours.trim().length > 0,
    photos.length >= MIN_PHOTOS,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 6) * 100));

  const submitDisabled =
    !title.trim() ||
    !zone ||
    !avgCheck ||
    !operatingHours.trim() ||
    photos.length < MIN_PHOTOS ||
    !phone.trim();

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
          submitLabel={isEditMode ? "შენახვა" : "განცხადების გამოქვეყნება"}
          submitDisabled={submitDisabled}
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
            title="ძირითადი ინფორმაცია"
            accent="orange"
          >
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
                  options={zoneOptions}
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

            <Field label="აღწერა">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="დეტალური აღწერა რესტორნის შესახებ..."
                rows={4}
                className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#F97316] focus:ring-2 focus:ring-[#FFEDD5]"
              />
            </Field>
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
                {FOOD_AMENITIES.map((a) => (
                  <ServiceCheckbox
                    key={a.key}
                    label={a.label}
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
                    <div className="text-xs text-[#94A3B8]">
                      მხოლოდ PDF ფაილი
                    </div>
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

          {/* Section 4 — Contact */}
          <WizardInnerCard
            number={4}
            title="საკონტაქტო ინფორმაცია"
            accent="orange"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="ტელეფონის ნომერი" required>
                <PhoneInput value={phone} onChange={setPhone} />
              </Field>
              <Field label="WhatsApp ნომერი" helper="სურვილისამებრ">
                <PhoneInput value={whatsapp} onChange={setWhatsapp} />
              </Field>
            </div>
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
