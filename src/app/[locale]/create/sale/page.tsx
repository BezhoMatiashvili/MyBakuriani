"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, MapPin } from "lucide-react";
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

type ConstructionUiStatus =
  | "under_construction"
  | "new_completed"
  | "old_completed";

const CONSTRUCTION_STATUSES: {
  value: ConstructionUiStatus;
  label: string;
}[] = [
  { value: "under_construction", label: "მშენებარე" },
  { value: "new_completed", label: "ახალი აშენებული/დასრულებული" },
  { value: "old_completed", label: "ძველი აშენებული" },
];

const HANDOVER_OPTIONS: { value: string; label: string }[] = [
  { value: "already", label: "უკვე ჩაბარებული" },
  { value: "2024-end", label: "2024 ბოლო" },
  { value: "2025-spring", label: "2025 გაზაფხული" },
  { value: "2026-end", label: "2026 ბოლო" },
];

const REPAIR_STATUSES: { value: string; label: string }[] = [
  { value: "black", label: "შავი კარკასი" },
  { value: "white", label: "თეთრი კარკასი" },
  { value: "green", label: "მწვანე კარკასი" },
  { value: "renovated", label: "გარემონტებული" },
  { value: "fully", label: "სრულად მოწყობილი" },
];

const MANAGEMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "yes", label: "აქვს კომპლექსის მენეჯმენტი" },
  { value: "no", label: "არ აქვს" },
];

const ROI_OPTIONS: { value: string; label: string }[] = [
  { value: "5-8", label: "5-8%" },
  { value: "8-12", label: "8-12%" },
  { value: "12-15", label: "12-15%" },
  { value: "15+", label: "15%+" },
];

const ZONE_OPTIONS: { value: string; label: string }[] =
  SEARCH_LOCATION_ZONES.map((z) => ({ value: z, label: z }));

const TITLE_MAX = 35;
const DESCRIPTION_MAX = 300;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 15;

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
  const [constructionStatus, setConstructionStatus] =
    useState<ConstructionUiStatus>("under_construction");
  const [handoverDate, setHandoverDate] = useState("");
  const [cadastralCode, setCadastralCode] = useState("");
  const [roomsCount, setRoomsCount] = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [repairStatus, setRepairStatus] = useState("");
  const [managementService, setManagementService] = useState("");
  const [expectedRoi, setExpectedRoi] = useState("");
  const [areaSqm, setAreaSqm] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [description, setDescription] = useState("");
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

      const dbConstructionStatus: "completed" | "under_construction" =
        constructionStatus === "under_construction"
          ? "under_construction"
          : "completed";

      const { data: inserted, error: insertError } = await supabase
        .from("properties")
        .insert({
          owner_id: user.id,
          type: propertyType,
          title: titleTrimmed,
          location: locationTrimmed,
          area_sqm: areaNum,
          photos,
          sale_price: priceNum,
          construction_status: dbConstructionStatus,
          description: description.trim() || null,
          house_rules: {
            handover_date: handoverDate || null,
            cadastral_code: cadastralCode || null,
            rooms_count: roomsCount || null,
            exact_location: exactLocation || null,
            repair_status: repairStatus || null,
            management_service: managementService || null,
            expected_roi: expectedRoi || null,
            construction_substatus: constructionStatus,
            price_currency: "USD",
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

  const requiredFilled = [
    title.trim().length > 0,
    location.trim().length > 0,
    cadastralCode.trim().length > 0,
    repairStatus.length > 0,
    managementService.length > 0,
    expectedRoi.length > 0,
    areaSqm.trim().length > 0,
    priceUsd.trim().length > 0,
    photos.length >= MIN_PHOTOS,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 9) * 100));

  const submitDisabled =
    !title.trim() ||
    !location.trim() ||
    !areaSqm ||
    !priceUsd ||
    photos.length < MIN_PHOTOS;

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
        {/* Section 1 — Identification & Status */}
        <WizardInnerCard
          number={1}
          title="იდენტიფიკაცია და სტატუსი"
          accent="blue"
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
                isUnderConstruction
                  ? { label: "მხოლოდ მშენებარეზე", variant: "green" }
                  : undefined
              }
            >
              <StyledSelect
                value={handoverDate}
                onValueChange={setHandoverDate}
                options={HANDOVER_OPTIONS}
                placeholder="აირჩიე"
                accent="blue"
                disabled={!isUnderConstruction}
              />
            </Field>
          </div>

          <Field label="საკადასტრო კოდი" required>
            <div className="relative">
              <input
                type="text"
                value={cadastralCode}
                onChange={(e) => setCadastralCode(e.target.value)}
                placeholder="00.00.00.000..."
                className={`${inputClass} pr-12`}
              />
              {cadastralCode.trim().length > 0 && (
                <CheckCircle2
                  className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 fill-[#2563EB] text-white"
                  strokeWidth={2.5}
                />
              )}
            </div>
            <div className="flex items-start gap-2 pt-1">
              <Info className="mt-0.5 size-3.5 shrink-0 text-[#2563EB]" />
              <p className="text-xs font-medium text-[#64748B]">
                თუ ბინა დასრულებულია, შეიყვანეთ ბინის კოდი. თუ მშენებარეა -
                მიუთითეთ მიწის/პროექტის კოდი.
              </p>
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="ოთახების რაოდენობა">
              <input
                type="text"
                value={roomsCount}
                onChange={(e) => setRoomsCount(e.target.value)}
                placeholder="მაგ: 1, 2, 3"
                className={inputClass}
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
                  className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-[0px_4px_10px_rgba(22,163,74,0.25)] transition-colors hover:bg-[#15803D]"
                  aria-label="რუკაზე ჩვენება"
                >
                  <MapPin className="size-5" strokeWidth={2.25} />
                </button>
              </div>
            </Field>
          </div>
        </WizardInnerCard>

        {/* Section 2 — Condition & Investment Metrics */}
        <WizardInnerCard
          number={2}
          title="მდგომარეობა და საინვესტიციო მეტრიკები"
          accent="blue"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field label="რემონტის მდგომარეობა">
              <StyledSelect
                value={repairStatus}
                onValueChange={setRepairStatus}
                options={REPAIR_STATUSES}
                placeholder="აირჩიე"
                accent="blue"
              />
            </Field>

            <Field label="მართვის სერვისი">
              <StyledSelect
                value={managementService}
                onValueChange={setManagementService}
                options={MANAGEMENT_OPTIONS}
                placeholder="აირჩიე"
                accent="blue"
              />
            </Field>

            <Field label="მოსალოდნელი ROI (%)">
              <StyledSelect
                value={expectedRoi}
                onValueChange={setExpectedRoi}
                options={ROI_OPTIONS}
                placeholder="აირჩიე"
                accent="green"
              />
            </Field>
          </div>
        </WizardInnerCard>

        {/* Section 3 — Finances & Photos */}
        <WizardInnerCard number={3} title="ფინანსები და ფართობი" accent="blue">
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
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#16A34A]">
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
            label="აღწერა"
            helper={`${description.length} / ${DESCRIPTION_MAX} სიმბოლო`}
          >
            <textarea
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
              }
              placeholder="მოკლედ აღწერეთ ობიექტი, მისი უპირატესობები, გარემო..."
              rows={4}
              className="min-h-[120px] w-full resize-y rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
            />
          </Field>

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
              variant="figma"
            />
          </Field>
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
        chip.variant === "green"
          ? "rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#166534]"
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
