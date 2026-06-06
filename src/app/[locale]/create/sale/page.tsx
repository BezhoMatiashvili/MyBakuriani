"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import PhotoUploader from "@/components/forms/PhotoUploader";
import PhoneInput from "@/components/forms/PhoneInput";
import { StyledSelect } from "@/components/ui/styled-select";
import { MapPinned } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveZones } from "@/lib/zones/client";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types/database";
import { SkierLoader } from "@/components/shared/SkierLoader";

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
  { value: "under_construction", label: "მშენებარე" },
  { value: "completed", label: "ახალი აშენებული/დასრულებული" },
];

const HANDOVER_OPTIONS = [
  { value: "უკვე ჩაბარებული", label: "უკვე ჩაბარებული" },
  { value: "2024 ბოლო", label: "2024 ბოლო" },
  { value: "2025 გაზაფხული", label: "2025 გაზაფხული" },
  { value: "2026 ბოლო", label: "2026 ბოლო" },
];

const RENOVATION_STATUSES = [
  { value: "black_frame", label: "შავი კარკასი" },
  { value: "white_frame", label: "თეთრი კარკასი" },
  { value: "green_frame", label: "მწვანე კარკასი" },
  { value: "renovated", label: "გარემონტებული" },
  { value: "fully_furnished", label: "სრულად მოწყობილი" },
];

const MANAGEMENT_SERVICES = [
  { value: "complex_management", label: "აქვს კომპლექსის მენეჯმენტი" },
  { value: "none", label: "არ აქვს" },
];

const ROI_OPTIONS = [
  { value: "5-8", label: "5-8%", min: 5, max: 8 },
  { value: "8-12", label: "8-12%", min: 8, max: 12 },
  { value: "12-15", label: "12-15%", min: 12, max: 15 },
  { value: "15-plus", label: "15%+", min: 15, max: null },
];

const TITLE_MAX = 35;
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 15;

export default function CreateSalePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <SkierLoader variant="inline" />
        </div>
      }
    >
      <CreateSalePageInner />
    </Suspense>
  );
}

function CreateSalePageInner() {
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
  const [propertyType, setPropertyType] =
    useState<Enums<"property_type">>("apartment");
  const [location, setLocation] = useState("");
  const [constructionStatus, setConstructionStatus] = useState<
    "completed" | "under_construction"
  >("under_construction");
  const [handoverDate, setHandoverDate] = useState("2026 ბოლო");
  const [cadastralCode, setCadastralCode] = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [renovationStatus, setRenovationStatus] = useState("white_frame");
  const [managementService, setManagementService] =
    useState("complex_management");
  const [roiRange, setRoiRange] = useState("12-15");
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
  const [unitsTotal, setUnitsTotal] = useState("");
  const [unitsSold, setUnitsSold] = useState("");
  const [unitsReserved, setUnitsReserved] = useState("");

  const isUnderConstruction = constructionStatus === "under_construction";

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
        setError("განცხადება ვერ მოიძებნა");
        setHydrating(false);
        return;
      }

      setTitle(data.title ?? "");
      setPropertyType((data.type ?? "apartment") as Enums<"property_type">);
      setLocation(data.location ?? "");
      setConstructionStatus(
        data.construction_status === "under_construction"
          ? "under_construction"
          : "completed",
      );
      setAreaSqm(data.area_sqm != null ? String(data.area_sqm) : "");
      setRooms(data.rooms != null ? String(data.rooms) : "");
      setBathrooms(data.bathrooms != null ? String(data.bathrooms) : "");
      setPriceUsd(data.sale_price != null ? String(data.sale_price) : "");
      setDescription(data.description ?? "");
      setDeveloper(data.developer ?? "");
      setRoiPercent(data.roi_percent != null ? String(data.roi_percent) : "");
      setCadastralCode(data.cadastral_code ?? "");
      if (data.renovation_status) {
        setRenovationStatus(data.renovation_status);
      }
      if (data.roi_percent != null) {
        const savedRoi = ROI_OPTIONS.find(
          (option) =>
            option.min === Number(data.roi_percent) &&
            option.max ===
              (data.roi_percent_max == null
                ? null
                : Number(data.roi_percent_max)),
        );
        if (savedRoi) setRoiRange(savedRoi.value);
      }
      setConstructionPercent(
        data.construction_progress_percent != null
          ? Number(data.construction_progress_percent)
          : 0,
      );
      if (data.completion_year != null) {
        setCompletionYear(String(data.completion_year));
      }
      setUnitsTotal(data.units_total != null ? String(data.units_total) : "");
      setUnitsSold(data.units_sold != null ? String(data.units_sold) : "");
      setUnitsReserved(
        data.units_reserved != null ? String(data.units_reserved) : "",
      );

      const rules =
        data.house_rules && typeof data.house_rules === "object"
          ? (data.house_rules as Record<string, unknown>)
          : {};
      if (typeof rules.handover_date === "string") {
        setHandoverDate(rules.handover_date);
      }
      if (typeof rules.exact_location === "string") {
        setExactLocation(rules.exact_location);
      }
      if (typeof rules.management_service === "string") {
        setManagementService(rules.management_service);
      }

      const stripPrefix = (v: string | null) =>
        v ? v.replace(/^\+995/, "").replace(/\D/g, "") : "";
      setPhone(stripPrefix(data.phone));
      setWhatsapp(stripPrefix(data.whatsapp));
      setPhotos(Array.isArray(data.photos) ? data.photos : []);

      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, user, supabase]);

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const titleTrimmed = title.trim();
      const locationTrimmed = location.trim();
      const cadastralCodeTrimmed = cadastralCode.trim();
      if (!titleTrimmed) throw new Error("არასწორი სათაური");
      if (!locationTrimmed) throw new Error("არასწორი მდებარეობა");
      if (!cadastralCodeTrimmed) throw new Error("მიუთითეთ საკადასტრო კოდი");

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

      const handoverYear = handoverDate.match(/\d{4}/)?.[0];
      const yearNum =
        isUnderConstruction && handoverYear
          ? Number(handoverYear)
          : isUnderConstruction && completionYear.trim()
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
      const roiOption = ROI_OPTIONS.find((option) => option.value === roiRange);
      const roiNum = roiOption?.min ?? parseOptionalNonNegative(roiPercent);
      const roiMaxNum = roiOption?.max ?? null;

      const unitsTotalNum = isUnderConstruction
        ? parseOptionalNonNegative(unitsTotal)
        : null;
      const unitsSoldNum = isUnderConstruction
        ? (parseOptionalNonNegative(unitsSold) ?? 0)
        : 0;
      const unitsReservedNum = isUnderConstruction
        ? (parseOptionalNonNegative(unitsReserved) ?? 0)
        : 0;
      if (
        unitsTotalNum !== null &&
        unitsSoldNum + unitsReservedNum > unitsTotalNum
      ) {
        throw new Error(
          "გაყიდული + ჯავშანი არ უნდა აღემატებოდეს ბინების საერთო რაოდენობას",
        );
      }

      const payload = {
        type: propertyType,
        title: titleTrimmed,
        description: description.trim() || null,
        location: locationTrimmed,
        area_sqm: areaNum,
        rooms: roomsNum,
        bathrooms: bathroomsNum,
        developer: developer.trim() || null,
        roi_percent: roiNum,
        roi_percent_max: roiMaxNum,
        photos,
        sale_price: priceNum,
        cadastral_code: cadastralCodeTrimmed,
        renovation_status: renovationStatus,
        construction_status: constructionStatus,
        construction_progress_percent: progressNum,
        completion_year: yearNum,
        units_total: unitsTotalNum,
        units_sold: unitsSoldNum,
        units_reserved: unitsReservedNum,
        house_rules: {
          handover_date: handoverDate || null,
          exact_location: exactLocation.trim() || null,
          management_service: managementService,
          price_currency: "USD",
        },
        phone: phone ? `+995${phone}` : null,
        whatsapp: whatsapp ? `+995${whatsapp}` : null,
        is_for_sale: true,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from("properties")
          .update(payload)
          .eq("id", editId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        router.push("/dashboard/seller");
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("properties")
          .insert({
            ...payload,
            owner_id: user.id,
            construction_stages: [],
            status: "pending" as Enums<"listing_status">,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        if (!inserted) throw new Error("შეცდომა. სცადეთ თავიდან.");
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
    location.trim().length > 0,
    cadastralCode.trim().length > 0,
    areaSqm.trim().length > 0,
    priceUsd.trim().length > 0,
    photos.length >= MIN_PHOTOS,
    phone.trim().length > 0,
  ].filter(Boolean).length;
  const progressPercent = Math.max(10, Math.round((requiredFilled / 7) * 100));

  const submitDisabled =
    !title.trim() ||
    !location.trim() ||
    !cadastralCode.trim() ||
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
                <StyledSelect
                  value={handoverDate}
                  onValueChange={setHandoverDate}
                  options={HANDOVER_OPTIONS}
                  accent="blue"
                  disabled={!isUnderConstruction}
                />
              </Field>
            </div>

            <Field
              label="საკადასტრო კოდი"
              required
              helper="თუ ბინა დასრულებულია, შეიყვანეთ ბინის კოდი. თუ მშენებარეა - მიუთითეთ მიწის/პროექტის კოდი."
            >
              <input
                type="text"
                value={cadastralCode}
                onChange={(e) => setCadastralCode(e.target.value)}
                placeholder="00.00.00.000..."
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="ოთახების რაოდენობა">
                <input
                  type="number"
                  value={rooms}
                  onChange={(e) => setRooms(e.target.value)}
                  placeholder="მაგ: 1, 2, 3"
                  min="0"
                  className={inputClass}
                />
              </Field>

              <Field label="ზუსტი ლოკაცია">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={exactLocation}
                    onChange={(e) => setExactLocation(e.target.value)}
                    placeholder="მაგ: ცენტრალური პარკის შესასვლელთან"
                    className={inputClass}
                  />
                  <div className="flex size-[48px] shrink-0 items-center justify-center rounded-xl bg-[#059669] text-white shadow-[0px_2px_4px_rgba(5,150,105,0.2)]">
                    <MapPinned className="size-5" />
                  </div>
                </div>
              </Field>
            </div>
          </WizardInnerCard>

          <WizardInnerCard
            number={2}
            title="მდგომარეობა და საინვესტიციო მეტრიკები"
            accent="green"
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Field label="რემონტის მდგომარეობა">
                <StyledSelect
                  value={renovationStatus}
                  onValueChange={setRenovationStatus}
                  options={RENOVATION_STATUSES}
                  accent="blue"
                />
              </Field>

              <Field label="მართვის სერვისი">
                <StyledSelect
                  value={managementService}
                  onValueChange={setManagementService}
                  options={MANAGEMENT_SERVICES}
                  accent="blue"
                />
              </Field>

              <Field label="მოსალოდნელი ROI (%)">
                <StyledSelect
                  value={roiRange}
                  onValueChange={setRoiRange}
                  options={ROI_OPTIONS}
                  accent="blue"
                />
              </Field>
            </div>
          </WizardInnerCard>

          <WizardInnerCard
            number={3}
            title="ფინანსები და ფართობი"
            accent="green"
          >
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
                  <span className="pointer-events-none absolute bottom-0 right-0 top-0 flex items-center rounded-r-xl border-l border-[#E2E8F0] bg-[#F8FAFC] px-4 text-xs font-bold text-[#64748B]">
                    კვ.მ
                  </span>
                </div>
              </Field>

              <Field label="ფასი (USD)" required>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[#059669]">
                    $
                  </span>
                  <input
                    type="number"
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value)}
                    placeholder="0"
                    min="1"
                    className={`${inputClass} pl-10`}
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
                variant="figma"
              />
            </Field>
          </WizardInnerCard>

          <WizardInnerCard
            number={4}
            title="დეტალები და კონტაქტი"
            accent="green"
          >
            <Field label="აღწერა">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="დეტალური აღწერა ობიექტის შესახებ..."
                rows={5}
                className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
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
      )}
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
