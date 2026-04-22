"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  WizardShell,
  WizardSection,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import ExactLocationPicker from "@/components/maps/ExactLocationPicker";
import { useAuth } from "@/lib/hooks/useAuth";
import { SEARCH_LOCATION_ZONES } from "@/lib/constants/locations";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";

const PROPERTY_TYPES: { value: Enums<"property_type">; label: string }[] = [
  { value: "apartment", label: "აპარტამენტი" },
  { value: "studio", label: "სტუდიო" },
  { value: "cottage", label: "კოტეჯი" },
  { value: "hotel", label: "სასტუმრო ოთახი" },
  { value: "villa", label: "ვილა" },
];

// Figma groups amenities into 4 buckets
type AmenityGroup = {
  key: string;
  label: string;
  options: { key: string; label: string }[];
};

const AMENITY_GROUPS: AmenityGroup[] = [
  {
    key: "winter",
    label: "ზამთრის ინფრასტრუქტურა",
    options: [
      { key: "ski_in_out", label: "Ski-in / Ski-out" },
      { key: "ski_storage", label: "თხილამურების სათავსო" },
      { key: "backup_generator", label: "სარეზერვო გენერატორი" },
      { key: "fireplace", label: "ბუხარი" },
    ],
  },
  {
    key: "comfort",
    label: "საბაზისო კომფორტი",
    options: [
      { key: "parking", label: "პარკინგი" },
      { key: "wifi", label: "უფასო Wi-Fi" },
      { key: "central_heating", label: "ცენტრალური გათბობა" },
      { key: "tv", label: "ტელევიზორი" },
    ],
  },
  {
    key: "kitchen",
    label: "სამზარეულო და საყოფაცხოვრებო",
    options: [
      { key: "washing_machine", label: "სარეცხი მანქანა" },
      { key: "dishwasher", label: "ჭურჭლის სარეცხი მანქანა" },
      { key: "full_kitchen", label: "სრულად აღჭურვილი სამზარეულო" },
      { key: "coffee_maker", label: "ყავის აპარატი" },
    ],
  },
  {
    key: "outdoor",
    label: "აივანი / გარე სივრცე",
    options: [
      { key: "no_balcony", label: "არ აქვს" },
      { key: "french_balcony", label: "ფრანგული აივანი" },
      { key: "standard_balcony", label: "სტანდარტული აივანი" },
      { key: "large_terrace", label: "დიდი ტერასა" },
      { key: "yard", label: "ეზო" },
    ],
  },
];

const HOSTING_LANGS = [
  { key: "ka", label: "ქართული" },
  { key: "en", label: "English" },
  { key: "ru", label: "Русский" },
  { key: "ar", label: "Arabic" },
];

const STEP_TITLES = [
  "ძირითადი ინფორმაცია",
  "ბინის დეტალები და მდებარეობა",
  "კეთილმოწყობა და დეტალები",
  "ფოტოები",
];

const TITLE_MAX = 35;

export default function CreateRentalPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: basics
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [location, setLocation] = useState("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: details + map
  const [title, setTitle] = useState("");
  const [exactLocation, setExactLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Step 3: amenities + dimensions
  const [areaSqm, setAreaSqm] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    "ski_storage",
  ]);

  // Step 4: pricing + photos
  const [pricePerNight, setPricePerNight] = useState("150");
  const [minBookingDays, setMinBookingDays] = useState("3");
  const [hostingLangs, setHostingLangs] = useState<string[]>(["ka"]);
  const [photos, setPhotos] = useState<string[]>([]);

  function toggleAmenity(key: string) {
    setSelectedAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key],
    );
  }

  function toggleLang(key: string) {
    setHostingLangs((prev) =>
      prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key],
    );
  }

  const isStepValid = (s: number): boolean => {
    if (s === 0) return !!propertyType && !!location;
    if (s === 1) return !!title.trim();
    if (s === 2) return true;
    if (s === 3) {
      const priceNum = Number(pricePerNight);
      return Number.isFinite(priceNum) && priceNum > 0;
    }
    return false;
  };

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const titleTrimmed = title.trim();
      const locationTrimmed = location.trim();
      if (!titleTrimmed) throw new Error("არასწორი სათაური");
      if (!locationTrimmed) throw new Error("არასწორი მდებარეობა");

      const priceNum = Number(pricePerNight);
      if (!Number.isFinite(priceNum) || priceNum <= 0 || priceNum > 100000) {
        throw new Error("არასწორი ფასი");
      }

      const parseOptionalPositive = (v: string): number | null => {
        if (!v) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          throw new Error("არასწორი მნიშვნელობა");
        return n;
      };

      const areaNum = parseOptionalPositive(areaSqm);
      const minBookingNum = Number(minBookingDays) || 1;

      const { data: inserted, error: insertError } = await supabase
        .from("properties")
        .insert({
          owner_id: user.id,
          type: propertyType,
          title: titleTrimmed,
          description: description.trim() || null,
          location: locationTrimmed,
          location_lat: exactLocation?.lat ?? null,
          location_lng: exactLocation?.lng ?? null,
          cadastral_code: cadastralCode.trim() || null,
          area_sqm: areaNum,
          photos,
          amenities: selectedAmenities,
          house_rules: {
            hosting_langs: hostingLangs,
          },
          price_per_night: priceNum,
          min_booking_days: minBookingNum,
          status: "pending" as Enums<"listing_status">,
          is_for_sale: false,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      if (!inserted) throw new Error("შეცდომა. სცადეთ თავიდან.");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა. სცადეთ თავიდან.");
    } finally {
      setLoading(false);
    }
  }

  const currentStepNumber = step + 1;
  const totalSteps = STEP_TITLES.length;
  const isFinalStep = step === totalSteps - 1;

  return (
    <WizardShell
      title={STEP_TITLES[step]}
      stepTitle={STEP_TITLES[step]}
      accent="blue"
      currentStep={currentStepNumber}
      totalSteps={totalSteps}
      footer={
        <WizardFooter
          accent="blue"
          showBack={step > 0}
          onBack={() => setStep((s) => Math.max(0, s - 1))}
          onSubmit={() => {
            if (isFinalStep) {
              handleSubmit();
            } else if (isStepValid(step)) {
              setStep((s) => Math.min(totalSteps - 1, s + 1));
            }
          }}
          submitDisabled={!isStepValid(step)}
          loading={loading}
          finalStep={isFinalStep}
          submitLabel={isFinalStep ? "გამოქვეყნება" : "გაგრძელება"}
          error={error}
        />
      }
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.22 }}
        >
          {step === 0 && (
            <WizardSection>
              <Field label="ბინის ტიპი" required>
                <select
                  value={propertyType}
                  onChange={(e) =>
                    setPropertyType(e.target.value as Enums<"property_type">)
                  }
                  className={inputClass}
                >
                  {PROPERTY_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="ლოკაცია" required>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    აირჩიე ზონა
                  </option>
                  {SEARCH_LOCATION_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="საკადასტრო კოდი">
                <input
                  type="text"
                  value={cadastralCode}
                  onChange={(e) => setCadastralCode(e.target.value)}
                  placeholder="XX.XX.XX.XXX.XXX"
                  className={inputClass}
                />
              </Field>

              <Field label="აღწერა">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="დეტალური აღწერა..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
                />
              </Field>
            </WizardSection>
          )}

          {step === 1 && (
            <WizardSection>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-5">
                  <Field
                    label="სათაური"
                    helper={`მაქსიმუმ ${TITLE_MAX} სიმბოლო`}
                  >
                    <input
                      type="text"
                      value={title}
                      onChange={(e) =>
                        setTitle(e.target.value.slice(0, TITLE_MAX))
                      }
                      placeholder="მაგ: მეორე კატეგორიის დიდველზე"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="ბინის ტიპი">
                    <select
                      value={propertyType}
                      onChange={(e) =>
                        setPropertyType(
                          e.target.value as Enums<"property_type">,
                        )
                      }
                      className={inputClass}
                    >
                      {PROPERTY_TYPES.map((pt) => (
                        <option key={pt.value} value={pt.value}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="ლოკაცია">
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={inputClass}
                    >
                      <option value="" disabled>
                        აირჩიე ზონა
                      </option>
                      {SEARCH_LOCATION_ZONES.map((zone) => (
                        <option key={zone} value={zone}>
                          {zone}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="space-y-5">
                  <Field label="ზუსტი მდებარეობა რუკაზე">
                    <ExactLocationPicker
                      value={exactLocation}
                      onChange={setExactLocation}
                    />
                  </Field>
                </div>
              </div>
            </WizardSection>
          )}

          {step === 2 && (
            <WizardSection title="კეთილმოწყობა და დეტალები">
              <Field label="ბინის საერთო ფართობი (მ²)">
                <input
                  type="number"
                  value={areaSqm}
                  onChange={(e) => setAreaSqm(e.target.value)}
                  placeholder="მაგ: 55"
                  min="0"
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {AMENITY_GROUPS.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <label className="text-[13px] font-bold text-[#334155]">
                      {group.label}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt) => {
                        const active = selectedAmenities.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => toggleAmenity(opt.key)}
                            className={`h-9 rounded-[10px] border px-3 text-sm transition-colors ${
                              active
                                ? "border-[#2563EB] bg-[#2563EB] font-semibold text-white"
                                : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </WizardSection>
          )}

          {step === 3 && (
            <WizardSection>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="ფასი 1 ღამეზე (GEL)">
                  <input
                    type="number"
                    value={pricePerNight}
                    onChange={(e) => setPricePerNight(e.target.value)}
                    placeholder="150"
                    min="1"
                    className={inputClass}
                  />
                </Field>

                <Field label="მინიმალური დღეები">
                  <select
                    value={minBookingDays}
                    onChange={(e) => setMinBookingDays(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      აირჩიე რაოდენობა
                    </option>
                    {["1", "2", "3", "4", "5"].map((v) => (
                      <option key={v} value={v}>
                        {v === "5" ? "5+ დღე" : `${v} დღე`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-bold text-[#334155]">
                  მასპინძლობის ენა
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {HOSTING_LANGS.map((lang) => {
                    const active = hostingLangs.includes(lang.key);
                    return (
                      <button
                        key={lang.key}
                        type="button"
                        onClick={() => toggleLang(lang.key)}
                        className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                          active
                            ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                            : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <span
                          className={`flex size-4 items-center justify-center rounded-[4px] border ${
                            active
                              ? "border-[#2563EB] bg-[#2563EB]"
                              : "border-[#CBD5E1] bg-white"
                          }`}
                        >
                          {active && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M1.5 5L4 7.5L8.5 3"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold text-[#334155]">
                    ფოტოების ატვირთვა
                  </label>
                  <span className="text-xs font-medium text-[#EF4444]">
                    ⚠ გამოიყენეთ Landscape ფოტოები
                  </span>
                </div>
                <PhotoUploader
                  photos={photos}
                  onPhotosChange={setPhotos}
                  maxPhotos={10}
                />
              </div>
            </WizardSection>
          )}
        </motion.div>
      </AnimatePresence>
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

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
      </label>
      {children}
      {helper && (
        <p className="text-right text-xs font-medium text-[#94A3B8]">
          {helper}
        </p>
      )}
    </div>
  );
}
