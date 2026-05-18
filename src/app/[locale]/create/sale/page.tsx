"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const TITLE_MAX = 35;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 15;

export default function CreateSalePage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const { zones } = useActiveZones();
  const zoneOptions = zones.map((z) => ({
    value: z.name_ka,
    label: z.name_ka,
  }));

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
  const [areaSqm, setAreaSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [description, setDescription] = useState("");
  const [developer, setDeveloper] = useState("");
  const [roiPercent, setRoiPercent] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [constructionPercent, setConstructionPercent] = useState(0);
  const [completionYear, setCompletionYear] = useState<string>(
    String(new Date().getFullYear() + 1),
  );

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

      const areaNum = Number(areaSqm);
      if (!Number.isFinite(areaNum) || areaNum <= 0) {
        throw new Error("არასწორი ფართობი");
      }

      const priceNum = Number(priceUsd);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        throw new Error("არასწორი ფასი");
      }

      if (photos.length < MIN_PHOTOS) {
        throw new Error(`მინიმუმ ${MIN_PHOTOS} ფოტო აუცილებელია`);
      }

      if (!phone.trim()) {
        throw new Error("მიუთითეთ ტელეფონის ნომერი");
      }

      const yearNum =
        isUnderConstruction && completionYear.trim()
          ? Number(completionYear)
          : null;
      const progressNum = isUnderConstruction ? constructionPercent : null;

      const parseOptionalNonNegative = (v: string): number | null => {
        if (!v.trim()) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return null;
        return n;
      };
      const roomsNum = parseOptionalNonNegative(rooms);
      const bathroomsNum = parseOptionalNonNegative(bathrooms);
      const roiNum = parseOptionalNonNegative(roiPercent);

      const { data: inserted, error: insertError } = await supabase
        .from("properties")
        .insert({
          owner_id: user.id,
          type: propertyType,
          title: titleTrimmed,
          description: description.trim() || null,
          location: locationTrimmed,
          area_sqm: areaNum,
          rooms: roomsNum,
          bathrooms: bathroomsNum,
          developer: developer.trim() || null,
          roi_percent: roiNum,
          photos,
          sale_price: priceNum,
          construction_status: constructionStatus,
          construction_progress_percent: progressNum,
          completion_year: yearNum,
          house_rules: {
            handover_date: handoverDate || null,
            price_currency: "USD",
          },
          phone: phone ? `+995${phone}` : null,
          whatsapp: whatsapp ? `+995${whatsapp}` : null,
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

  const requiredFilled = [
    title.trim().length > 0,
    location.trim().length > 0,
    areaSqm.trim().length > 0,
    priceUsd.trim().length > 0,
    photos.length >= MIN_PHOTOS,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 6) * 100));

  const submitDisabled =
    !title.trim() ||
    !location.trim() ||
    !areaSqm ||
    !priceUsd ||
    photos.length < MIN_PHOTOS ||
    !phone.trim();

  return (
    <WizardShell
      title="ყიდვა / გაყიდვა"
      accent="green"
      progressPercent={progressPercent}
      footer={
        <WizardFooter
          accent="green"
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
                options={zoneOptions}
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
                isUnderConstruction
                  ? { label: "მხოლოდ მშენებარეზე" }
                  : undefined
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

          {isUnderConstruction && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="მზადყოფნა"
                chip={{
                  label: `${constructionPercent}%`,
                  variant: "green",
                }}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={constructionPercent}
                  onChange={(e) =>
                    setConstructionPercent(Number(e.target.value))
                  }
                  className="h-[48px] w-full accent-[#16A34A]"
                />
              </Field>
              <Field label="დასრულების წელი">
                <input
                  type="number"
                  inputMode="numeric"
                  min={new Date().getFullYear() - 5}
                  max={new Date().getFullYear() + 15}
                  value={completionYear}
                  onChange={(e) => setCompletionYear(e.target.value)}
                  placeholder={String(new Date().getFullYear() + 1)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="საერთო ფართობი (კვ.მ)" required>
              <div className="relative">
                <input
                  type="number"
                  value={areaSqm}
                  onChange={(e) => setAreaSqm(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.1"
                  className={`${inputClass} pr-16`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-[#F1F5F9] px-2 py-1 text-xs font-bold text-[#475569]">
                  კვ.მ
                </span>
              </div>
            </Field>

            <Field label="ფასი (USD)" required>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#94A3B8]">
                  $
                </span>
                <input
                  type="number"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  placeholder="0"
                  min="1"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
          </div>

          <Field
            label="ფოტოები / რენდერები"
            required
            chip={{ label: `მინ. ${MIN_PHOTOS} ფოტო`, variant: "blue" }}
            chipPosition="end"
          >
            <PhotoUploader
              photos={photos}
              onPhotosChange={setPhotos}
              maxPhotos={MAX_PHOTOS}
            />
            <p className="mt-2 text-xs font-medium text-[#94A3B8]">
              მაქს. {MAX_PHOTOS} ფოტო
            </p>
          </Field>
        </WizardInnerCard>

        <WizardInnerCard number={2} title="დეტალები და კონტაქტი" accent="green">
          <Field label="აღწერა">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="დეტალური აღწერა ობიექტის შესახებ..."
              rows={5}
              className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
            />
          </Field>

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
            <Field label="სააბაზანოები">
              <input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                placeholder="მაგ: 1"
                min="0"
                className={inputClass}
              />
            </Field>
            <Field label="წლიური ROI (%)" helper="სურვილისამებრ">
              <input
                type="number"
                value={roiPercent}
                onChange={(e) => setRoiPercent(e.target.value)}
                placeholder="მაგ: 8"
                min="0"
                max="100"
                step="0.1"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="დეველოპერი / გამყიდველი" helper="სურვილისამებრ">
            <input
              type="text"
              value={developer}
              onChange={(e) => setDeveloper(e.target.value)}
              placeholder="მაგ: My Bakuriani Group"
              className={inputClass}
            />
          </Field>

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
  chipPosition = "inline",
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  chip?: { label: string; variant?: "green" | "blue" };
  chipPosition?: "inline" | "end";
  children: React.ReactNode;
}) {
  const chipEl = chip ? (
    <span
      className={
        chip.variant === "blue"
          ? "rounded-md bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold text-[#1D4ED8]"
          : "rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]"
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
