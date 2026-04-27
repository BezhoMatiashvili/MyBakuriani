"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import PhotoUploader from "@/components/forms/PhotoUploader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const VEHICLE_MAKES = [
  { value: "Toyota", label: "Toyota" },
  { value: "Mercedes-Benz", label: "Mercedes-Benz" },
  { value: "Ford", label: "Ford" },
  { value: "Mitsubishi", label: "Mitsubishi" },
  { value: "Honda", label: "Honda" },
  { value: "Volkswagen", label: "Volkswagen" },
  { value: "სხვა", label: "სხვა" },
] as const;

const TRANSPORT_TYPES = [
  { value: "minivan", label: "მინივენი" },
  { value: "taxi", label: "ტაქსი" },
  { value: "microbus", label: "მიკროავტობუსი" },
  { value: "other", label: "სხვა" },
] as const;

const PRICE_UNITS = [
  { value: "whole_car", label: "მთლიანი მანქანა" },
  { value: "on_demand", label: "გამოძახება" },
  { value: "per_person", label: "ერთ კაცზე" },
] as const;

const ROUTE_OPTIONS = [
  "შიდა გადაადგილება (ტაქსი)",
  "თბილისი - ბაკურიანი - თბილისი",
  "აეროპორტის ტრანსფერი",
  "სხვა",
];

const EQUIPMENT_OPTIONS = [
  "ზამთრის საბურავები",
  "მოცურების ჯაჭვები",
  "თხილამურის საბარგული",
  "დამატებითი საბარგული",
  "ბავშვის სავარძელი",
];

const LANGUAGE_OPTIONS = ["ქართული", "English", "Русский"];

const MIN_PHOTOS = 1;
const MAX_PHOTOS = 10;

export default function CreateTransportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [driverName, setDriverName] = useState("");
  const [vehicleMake, setVehicleMake] =
    useState<(typeof VEHICLE_MAKES)[number]["value"]>("Mercedes-Benz");
  const [transportType, setTransportType] =
    useState<(typeof TRANSPORT_TYPES)[number]["value"]>("minivan");
  const [vehicleCapacity, setVehicleCapacity] = useState("");
  const [routes, setRoutes] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] =
    useState<(typeof PRICE_UNITS)[number]["value"]>("whole_car");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  function toggle(arr: string[], value: string): string[] {
    return arr.includes(value)
      ? arr.filter((v) => v !== value)
      : [...arr, value];
  }

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      if (!driverName.trim()) throw new Error("მიუთითეთ მძღოლის სახელი");
      if (!vehicleCapacity) throw new Error("მიუთითეთ ადგილების რაოდენობა");
      if (routes.length === 0) throw new Error("აირჩიეთ მინიმუმ ერთი მარშრუტი");
      if (!price) throw new Error("მიუთითეთ საწყისი ფასი");
      if (photos.length < MIN_PHOTOS)
        throw new Error("ატვირთეთ მინიმუმ ერთი ფოტო");

      const { error: insertError } = await supabase.from("services").insert({
        owner_id: user.id,
        category: "transport",
        title: driverName.trim(),
        driver_name: driverName.trim(),
        vehicle_make: vehicleMake,
        transport_type: transportType,
        vehicle_capacity: Number(vehicleCapacity),
        routes,
        price: Number(price),
        price_unit: priceUnit,
        equipment,
        languages,
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
    driverName.trim().length > 0,
    vehicleCapacity.length > 0,
    routes.length > 0,
    price.length > 0,
    photos.length >= MIN_PHOTOS,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 5) * 100));

  const submitDisabled =
    !driverName.trim() ||
    !vehicleCapacity ||
    routes.length === 0 ||
    !price ||
    photos.length < MIN_PHOTOS;

  return (
    <WizardShell
      title="ტრანსპორტი და ტრანსფერები"
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
      <div className="space-y-8">
        {/* Section 1 — Basic info */}
        <WizardInnerCard number={1} title="ძირითადი ინფორმაცია" accent="blue">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="მძღოლის სახელი" required>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="გოგა მ."
                className={inputClass}
              />
            </Field>
            <Field label="მანქანის მარკა" required>
              <StyledSelect
                value={vehicleMake}
                onValueChange={setVehicleMake}
                options={VEHICLE_MAKES}
                accent="blue"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="ტრანსპორტის ტიპი" required>
              <StyledSelect
                value={transportType}
                onValueChange={setTransportType}
                options={TRANSPORT_TYPES}
                accent="blue"
              />
            </Field>
            <Field label="რამდენ ადგილიანია მანქანა" required>
              <input
                type="number"
                value={vehicleCapacity}
                onChange={(e) => setVehicleCapacity(e.target.value)}
                placeholder="8"
                min="1"
                className={inputClass}
              />
            </Field>
          </div>
        </WizardInnerCard>

        {/* Section 2 — Route & price */}
        <WizardInnerCard number={2} title="მარშრუტი და ფასი" accent="blue">
          <Field label="ძირითადი მარშრუტები" required>
            <div className="flex flex-wrap gap-2">
              {ROUTE_OPTIONS.map((r) => (
                <Chip
                  key={r}
                  active={routes.includes(r)}
                  onClick={() => setRoutes(toggle(routes, r))}
                >
                  {r}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="საწყისი ფასი (GEL)" required>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="250"
                min="0"
                className={inputClass}
              />
            </Field>
            <Field label="ფასის ერთეული" required>
              <StyledSelect
                value={priceUnit}
                onValueChange={setPriceUnit}
                options={PRICE_UNITS}
                accent="blue"
              />
            </Field>
          </div>
        </WizardInnerCard>

        {/* Section 3 — Equipment & languages */}
        <WizardInnerCard number={3} title="აღჭურვილობა და ენები" accent="blue">
          <Field label="მანქანის აღჭურვილობა">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((e) => (
                <Chip
                  key={e}
                  active={equipment.includes(e)}
                  onClick={() => setEquipment(toggle(equipment, e))}
                >
                  {e}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="სასაუბრო ენები">
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((l) => (
                <Chip
                  key={l}
                  active={languages.includes(l)}
                  onClick={() => setLanguages(toggle(languages, l))}
                >
                  {l}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="მანქანის ფოტოები" required>
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
      <label className="text-[13px] font-bold text-[#334155]">
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-[10px] border px-3 text-sm transition-colors ${
        active
          ? "border-[#2563EB] bg-[#2563EB] font-semibold text-white"
          : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]"
      }`}
    >
      {children}
    </button>
  );
}
