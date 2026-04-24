"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import type { Enums } from "@/lib/types/database";

const PROPERTY_TYPES: { value: Enums<"property_type">; label: string }[] = [
  { value: "studio", label: "სტუდიო" },
  { value: "apartment", label: "აპარტამენტი" },
  { value: "cottage", label: "კოტეჯი" },
  { value: "villa", label: "მიწის ნაკვეთი" },
  { value: "hotel", label: "სასტუმრო ოთახი" },
];

const CONSTRUCTION_STATUSES: {
  value: "completed" | "under_construction";
  label: string;
}[] = [
  { value: "completed", label: "დასრულებული" },
  { value: "under_construction", label: "მშენებარე" },
];

const ZONE_OPTIONS: { value: string; label: string }[] =
  SEARCH_LOCATION_ZONES.map((z) => ({ value: z, label: z }));

const TITLE_MAX = 35;

const ExactLocationPicker = dynamic(
  () => import("@/components/maps/ExactLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full animate-pulse rounded-xl bg-[#E2E8F0]" />
    ),
  },
);

export default function CreateSalePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [location, setLocation] = useState("");
  const [constructionStatus, setConstructionStatus] = useState<
    "completed" | "under_construction"
  >("completed");
  const [handoverDate, setHandoverDate] = useState("");
  const [description, setDescription] = useState("");
  const [exactLocation, setExactLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [cadastralCode, setCadastralCode] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [roiPercent, setRoiPercent] = useState("");
  const [developer, setDeveloper] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const isUnderConstruction = constructionStatus === "under_construction";

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const titleTrimmed = title.trim();
      const locationTrimmed = location.trim();
      if (!titleTrimmed) throw new Error("არასწორი სათაური");
      if (!locationTrimmed) throw new Error("არასწორი მდებარეობა");

      const priceNum = Number(salePrice);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
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
      const roomsNum = parseOptionalPositive(rooms);
      const bathroomsNum = parseOptionalPositive(bathrooms);
      const roiNum = roiPercent ? Number(roiPercent) : null;

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
          rooms: roomsNum,
          bathrooms: bathroomsNum,
          photos,
          sale_price: priceNum,
          roi_percent: roiNum,
          construction_status: constructionStatus,
          developer: developer.trim() || null,
          house_rules: {
            handover_date: handoverDate || null,
          },
          status: "pending" as Enums<"listing_status">,
          is_for_sale: true,
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

  return (
    <WizardShell
      title="ყიდვა / გაყიდვა"
      accent="green"
      footer={
        <WizardFooter
          accent="green"
          backHref="/create"
          onSubmit={handleSubmit}
          submitLabel="განცხადების გამოქვეყნება"
          submitDisabled={!title.trim() || !location.trim() || !salePrice}
          loading={loading}
          error={error}
        />
      }
    >
      <WizardInnerCard
        number={1}
        title="იდენტიფიკაცია და სტატუსი"
        accent="green"
      >
        <Field
          label="სათაური"
          required
          helper={`მაქსიმუმ ${TITLE_MAX} სიმბოლო`}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            placeholder="მაგ: საინვესტიციო აპარტამენტი დიდველზე..."
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="ობიექტის ტიპი" required>
            <StyledSelect
              value={propertyType}
              onValueChange={setPropertyType}
              options={PROPERTY_TYPES}
              accent="blue"
            />
          </Field>

          <Field label="ლოკაცია (ZONE)" required>
            <StyledSelect
              value={location}
              onValueChange={setLocation}
              options={ZONE_OPTIONS}
              placeholder="აირჩიე ზონა"
              accent="blue"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="მშენებლობის სტატუსი" required>
            <StyledSelect
              value={constructionStatus}
              onValueChange={setConstructionStatus}
              options={CONSTRUCTION_STATUSES}
              accent="blue"
            />
          </Field>

          <Field
            label="ჩაბარების დრო"
            chip={
              isUnderConstruction ? { label: "მხოლოდ მშენებარეზე" } : undefined
            }
          >
            <input
              type="month"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
              disabled={!isUnderConstruction}
              className={`${inputClass} ${!isUnderConstruction ? "cursor-not-allowed bg-[#F8FAFC] text-[#94A3B8]" : ""}`}
            />
          </Field>
        </div>

        <Field label="ზუსტი მდებარეობა რუკაზე">
          <ExactLocationPicker
            value={exactLocation}
            onChange={setExactLocation}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Field label="ფართი (მ²)">
            <input
              type="number"
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
              placeholder="0"
              min="0"
              className={inputClass}
            />
          </Field>
          <Field label="ოთახები">
            <input
              type="number"
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              placeholder="0"
              min="0"
              className={inputClass}
            />
          </Field>
          <Field label="სააბაზანო">
            <input
              type="number"
              value={bathrooms}
              onChange={(e) => setBathrooms(e.target.value)}
              placeholder="0"
              min="0"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="საკადასტრო კოდი">
          <input
            type="text"
            value={cadastralCode}
            onChange={(e) => setCadastralCode(e.target.value)}
            placeholder="XX.XX.XX.XXX.XXX"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="გასაყიდი ფასი (₾)" required>
            <input
              type="number"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0"
              min="1"
              className={inputClass}
            />
          </Field>
          <Field label="ROI (%)">
            <input
              type="number"
              value={roiPercent}
              onChange={(e) => setRoiPercent(e.target.value)}
              placeholder="მაგ: 12"
              min="0"
              max="100"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="დეველოპერი">
          <input
            type="text"
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
            placeholder="კომპანიის სახელი"
            className={inputClass}
          />
        </Field>

        <Field label="აღწერა">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="დეტალური აღწერა..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
          />
        </Field>

        <Field label="ფოტოები">
          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={10}
          />
        </Field>
      </WizardInnerCard>
    </WizardShell>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]";

function Field({
  label,
  required,
  helper,
  chip,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  chip?: { label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[13px] font-bold text-[#334155]">
          {label}
          {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
        </label>
        {chip && (
          <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]">
            {chip.label}
          </span>
        )}
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
