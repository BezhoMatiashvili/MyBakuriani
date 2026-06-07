"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { CigaretteOff, PawPrint } from "lucide-react";
import {
  WizardShell,
  WizardSection,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import AvailabilityWizardStep from "@/components/forms/AvailabilityWizardStep";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import {
  AMENITY_GROUPS,
  HOSTING_LANGS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/constants/listing-options";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { AvailabilityStatus, buildNext30Days } from "@/lib/utils/availability";

const PROPERTY_TYPES: { value: Enums<"property_type">; label: string }[] = (
  ["apartment", "studio", "cottage", "hotel", "villa"] as const
).map((value) => ({ value, label: PROPERTY_TYPE_LABELS[value] ?? value }));

const STEP_TITLES = [
  "ძირითადი ინფორმაცია",
  "ბინის დეტალები და მდებარეობა",
  "კეთილმოწყობა და დეტალები",
  "ფასი და ხელმისაწვდომობა",
  "ფოტოები და კონტაქტი",
];

function buildDefaultAvailability(): Map<string, AvailabilityStatus> {
  return buildNext30Days().reduce((acc, d) => {
    acc.set(d, "available");
    return acc;
  }, new Map<string, AvailabilityStatus>());
}

const TITLE_MAX = 35;

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

export default function CreateRentalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateRentalPageInner />
    </Suspense>
  );
}

function CreateRentalPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const { user } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(isEditMode);

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

  // Step 3: amenities + dimensions + house rules
  const [rooms, setRooms] = useState("");
  const [capacity, setCapacity] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    "ski_storage",
  ]);
  const [smokingAllowed, setSmokingAllowed] = useState<boolean | null>(null);
  const [petsAllowed, setPetsAllowed] = useState<boolean | null>(null);

  // Step 4: availability (next 30 days)
  const [availability, setAvailability] = useState<
    Map<string, AvailabilityStatus>
  >(buildDefaultAvailability);
  const [bookedDates, setBookedDates] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Baseline captured at hydration so edit-mode only writes changed days.
  const availabilityBaselineRef = useRef<Map<string, AvailabilityStatus>>(
    new Map(),
  );
  // Per-day price overrides (date → absolute price). Absent = base price.
  const [priceOverrides, setPriceOverrides] = useState<Map<string, number>>(
    () => new Map(),
  );
  const priceOverridesBaselineRef = useRef<Map<string, number>>(new Map());

  // Step 5: pricing + contact + photos
  const [pricePerNight, setPricePerNight] = useState("150");
  const [minBookingDays, setMinBookingDays] = useState("3");
  const [hostingLangs, setHostingLangs] = useState<string[]>(["ka"]);
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!editId || !user) return;
    let cancelled = false;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", editId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError || !data) {
        setError("ბინა ვერ მოიძებნა");
        setHydrating(false);
        return;
      }

      setPropertyType((data.type ?? "apartment") as Enums<"property_type">);
      setLocation(data.location ?? "");
      setCadastralCode(data.cadastral_code ?? "");
      setDescription(data.description ?? "");
      setTitle(data.title ?? "");
      if (data.location_lat != null && data.location_lng != null) {
        setExactLocation({
          lat: Number(data.location_lat),
          lng: Number(data.location_lng),
        });
      }
      setRooms(data.rooms != null ? String(data.rooms) : "");
      setCapacity(data.capacity != null ? String(data.capacity) : "");
      setAreaSqm(data.area_sqm != null ? String(data.area_sqm) : "");
      setBathrooms(data.bathrooms != null ? String(data.bathrooms) : "");
      setSelectedAmenities(
        Array.isArray(data.amenities)
          ? (data.amenities as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [],
      );
      setPricePerNight(
        data.price_per_night != null ? String(data.price_per_night) : "",
      );
      setMinBookingDays(
        data.min_booking_days != null ? String(data.min_booking_days) : "3",
      );
      const rules =
        data.house_rules && typeof data.house_rules === "object"
          ? (data.house_rules as Record<string, unknown>)
          : {};
      if (Array.isArray(rules.hosting_langs)) {
        setHostingLangs(
          (rules.hosting_langs as unknown[]).filter(
            (v): v is string => typeof v === "string",
          ),
        );
      }
      if (typeof rules.smoking === "boolean") setSmokingAllowed(rules.smoking);
      if (typeof rules.pets === "boolean") setPetsAllowed(rules.pets);
      const stripPrefix = (v: string | null) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";
      setPhone(stripPrefix(data.phone));
      setWhatsapp(stripPrefix(data.whatsapp));
      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      // Hydrate availability for the next-30-day window from existing rows
      const windowDates = buildNext30Days();
      const startIso = windowDates[0];
      const endIso = windowDates[windowDates.length - 1];
      const { data: blocks } = await supabase
        .from("calendar_blocks")
        .select("date, status")
        .eq("property_id", editId)
        .gte("date", startIso)
        .lte("date", endIso);

      if (cancelled) return;

      const hydrated = buildDefaultAvailability();
      const booked = new Set<string>();
      for (const row of blocks ?? []) {
        if (row.status === "booked") {
          booked.add(row.date);
          // Bookings never change in the wizard — keep value map in a safe state
          hydrated.set(row.date, "blocked");
        } else if (row.status === "blocked") {
          hydrated.set(row.date, "blocked");
        } else if (row.status === "available") {
          hydrated.set(row.date, "available");
        }
      }
      availabilityBaselineRef.current = new Map(hydrated);
      setAvailability(hydrated);
      setBookedDates(booked);

      // Hydrate per-day price overrides for the same window
      const { data: overrides } = await supabase
        .from("price_overrides")
        .select("date, price")
        .eq("property_id", editId)
        .gte("date", startIso)
        .lte("date", endIso);

      if (cancelled) return;

      const hydratedOverrides = new Map<string, number>();
      for (const row of overrides ?? []) {
        hydratedOverrides.set(row.date, Number(row.price));
      }
      priceOverridesBaselineRef.current = new Map(hydratedOverrides);
      setPriceOverrides(hydratedOverrides);

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase]);

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
    if (s === 2) return smokingAllowed !== null && petsAllowed !== null;
    // Step 3: base price + availability (defaults to all-available next 30 days)
    if (s === 3) {
      const priceNum = Number(pricePerNight);
      return (
        availability.size >= 30 && Number.isFinite(priceNum) && priceNum > 0
      );
    }
    if (s === 4) return phone.trim().length > 0;
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

      if (smokingAllowed === null || petsAllowed === null) {
        throw new Error("აირჩიეთ სახლის წესები");
      }

      if (!phone.trim()) {
        throw new Error("მიუთითეთ ტელეფონის ნომერი");
      }

      const parseOptionalPositive = (v: string): number | null => {
        if (!v) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0)
          throw new Error("არასწორი მნიშვნელობა");
        return n;
      };

      const areaNum = parseOptionalPositive(areaSqm);
      const roomsNum = parseOptionalPositive(rooms);
      const bathroomsNum = parseOptionalPositive(bathrooms);
      const capacityNum = parseOptionalPositive(capacity);
      const minBookingNum = Number(minBookingDays) || 1;

      const payload = {
        type: propertyType,
        title: titleTrimmed,
        description: description.trim() || null,
        location: locationTrimmed,
        location_lat: exactLocation?.lat ?? null,
        location_lng: exactLocation?.lng ?? null,
        cadastral_code: cadastralCode.trim() || null,
        area_sqm: areaNum,
        rooms: roomsNum,
        bathrooms: bathroomsNum,
        capacity: capacityNum,
        photos,
        amenities: selectedAmenities,
        house_rules: {
          hosting_langs: hostingLangs,
          smoking: smokingAllowed,
          pets: petsAllowed,
        },
        price_per_night: priceNum,
        min_booking_days: minBookingNum,
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
      };

      let propertyId: string;
      if (editId) {
        const { error: updateError } = await supabase
          .from("properties")
          .update(payload)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        propertyId = editId;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("properties")
          .insert({
            ...payload,
            owner_id: user.id,
            status: "pending" as Enums<"listing_status">,
            is_for_sale: false,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        if (!inserted) throw new Error("შეცდომა. სცადეთ თავიდან.");
        propertyId = inserted.id;
      }

      // Persist the availability declaration. In edit mode we only write the
      // days the renter actually changed — leaves any booked rows / manual_price
      // overrides untouched on dates they didn't touch.
      const baseline = availabilityBaselineRef.current;
      const rowsToUpsert = Array.from(availability.entries())
        .filter(([date, status]) => {
          if (bookedDates.has(date)) return false; // never overwrite bookings
          if (!editId) return true;
          return baseline.get(date) !== status;
        })
        .map(([date, status]) => ({
          property_id: propertyId,
          date,
          status,
          booking_id: null,
        }));

      if (rowsToUpsert.length > 0) {
        const { error: availabilityError } = await supabase
          .from("calendar_blocks")
          .upsert(rowsToUpsert, { onConflict: "property_id,date" });

        if (availabilityError) {
          throw new Error(
            "ხელმისაწვდომობის შენახვა ვერ მოხერხდა, სცადეთ თავიდან",
          );
        }
      }

      // Persist per-day price overrides. On create we write every override;
      // on edit we write only new/changed days and delete cleared ones, so
      // booked days and untouched dates keep their existing prices.
      const overrideBaseline = priceOverridesBaselineRef.current;
      const overrideRowsToUpsert = Array.from(priceOverrides.entries())
        .filter(([date, price]) => {
          if (bookedDates.has(date)) return false;
          if (!editId) return true;
          const prev = overrideBaseline.get(date);
          return prev === undefined || prev !== price;
        })
        .map(([date, price]) => ({ property_id: propertyId, date, price }));

      const overrideDatesToDelete = editId
        ? Array.from(overrideBaseline.keys()).filter(
            (date) => !priceOverrides.has(date) && !bookedDates.has(date),
          )
        : [];

      if (overrideRowsToUpsert.length > 0) {
        const { error: overrideError } = await supabase
          .from("price_overrides")
          .upsert(overrideRowsToUpsert, { onConflict: "property_id,date" });

        if (overrideError) {
          throw new Error("ფასების შენახვა ვერ მოხერხდა, სცადეთ თავიდან");
        }
      }

      if (overrideDatesToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("price_overrides")
          .delete()
          .eq("property_id", propertyId)
          .in("date", overrideDatesToDelete);

        if (deleteError) {
          throw new Error("ფასების განახლება ვერ მოხერხდა, სცადეთ თავიდან");
        }
      }

      router.push(editId ? "/dashboard/renter" : "/dashboard");
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
          submitLabel={
            isFinalStep
              ? isEditMode
                ? "შენახვა"
                : "გამოქვეყნება"
              : "გაგრძელება"
          }
          error={error}
        />
      }
    >
      {hydrating ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      ) : (
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
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.name_ka}>
                        {zone.name_ka}
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
                        {zones.map((zone) => (
                          <option key={zone.id} value={zone.name_ka}>
                            {zone.name_ka}
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
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <Field label="ოთახების რაოდენობა">
                    <input
                      type="number"
                      value={rooms}
                      onChange={(e) => setRooms(e.target.value)}
                      placeholder="მაგ: 2"
                      min="0"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="მაქს. სტუმრების რაოდენობა">
                    <input
                      type="number"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="მაგ: 4"
                      min="0"
                      className={inputClass}
                    />
                  </Field>
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
                </div>

                <div className="space-y-4 pt-2">
                  <Field label="სველი წერტილები">
                    <input
                      type="number"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      placeholder="მაგ: 1"
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
                </div>

                <div className="space-y-4 pt-2">
                  <label className="text-[13px] font-bold text-[#334155]">
                    სახლის წესები
                    <span className="ml-0.5 text-[#EF4444]">*</span>
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <HouseRuleField
                      icon={<CigaretteOff className="h-5 w-5 text-[#EF4444]" />}
                      label="მოწევა"
                      value={smokingAllowed}
                      onChange={setSmokingAllowed}
                    />
                    <HouseRuleField
                      icon={<PawPrint className="h-5 w-5 text-[#16A34A]" />}
                      label="ცხოველები"
                      value={petsAllowed}
                      onChange={setPetsAllowed}
                    />
                  </div>
                </div>
              </WizardSection>
            )}

            {step === 3 && (
              <WizardSection>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label="ფასი 1 ღამეზე (GEL)" required>
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

                <AvailabilityWizardStep
                  value={availability}
                  onChange={setAvailability}
                  bookedDates={bookedDates}
                  basePrice={Number(pricePerNight) || 0}
                  priceOverrides={priceOverrides}
                  onPriceOverridesChange={setPriceOverrides}
                />
              </WizardSection>
            )}

            {step === 4 && (
              <WizardSection>
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
                              ? "border-[#2563EB] bg-[#EFF6FF] text-[#0F172A]"
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

                <div className="space-y-4 pt-2">
                  <label className="text-[13px] font-bold text-[#334155]">
                    საკონტაქტო ინფორმაცია
                  </label>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <Field label="ტელეფონის ნომერი" required>
                      <PhoneInput value={phone} onChange={setPhone} />
                    </Field>
                    <Field label="WhatsApp ნომერი" helper="სურვილისამებრ">
                      <PhoneInput value={whatsapp} onChange={setWhatsapp} />
                    </Field>
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
      )}
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

function HouseRuleField({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
        {icon}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
          {label}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`h-8 rounded-[10px] border px-3 text-xs font-semibold transition-colors ${
              value === true
                ? "border-[#16A34A] bg-[#16A34A] text-white"
                : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
            }`}
          >
            დაშვებულია
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`h-8 rounded-[10px] border px-3 text-xs font-semibold transition-colors ${
              value === false
                ? "border-[#EF4444] bg-[#EF4444] text-white"
                : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
            }`}
          >
            აკრძალულია
          </button>
        </div>
      </div>
    </div>
  );
}
