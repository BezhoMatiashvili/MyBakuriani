"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  WizardShell,
  WizardInnerCard,
  WizardFooter,
} from "@/components/forms/WizardShell";
import { StyledSelect } from "@/components/ui/styled-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/constants/georgian-cities";
import PhoneInput from "@/components/forms/PhoneInput";
import SingleImageUploader from "@/components/forms/SingleImageUploader";
import { SkierLoader } from "@/components/shared/SkierLoader";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { isValidGePhone } from "@/lib/utils/number";
import { cn } from "@/lib/utils";

const ExactLocationPicker = dynamic(
  () => import("@/components/maps/ExactLocationPicker"),
  { ssr: false, loading: () => <SkierLoader variant="inline" /> },
);

const ORG_TYPE_VALUES = ["shps", "sps", "im", "ks", "ss", "coop", "aip"];
const COMPANY_TYPE_VALUES = ["agency", "developer"];

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2",
        error &&
          "[&_input]:border-[#EF4444] [&_button]:border-[#EF4444] [&_input]:ring-2 [&_input]:ring-[#FEE2E2]",
      )}
    >
      <label
        className={cn(
          "text-[13px] font-bold",
          error ? "text-[#EF4444]" : "text-[#334155]",
        )}
      >
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
        {hint && (
          <span className="ml-1.5 font-medium text-[#94A3B8]">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]";

export default function OrganizationNewPage() {
  const t = useTranslations("Organizations");
  const router = useRouter();
  const { user } = useAuth();

  const [orgType, setOrgType] = useState("shps");
  const [legalName, setLegalName] = useState("");
  const [idCode, setIdCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [companyType, setCompanyType] = useState("agency");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const orgTypeOptions = useMemo(
    () => ORG_TYPE_VALUES.map((v) => ({ value: v, label: t(`orgTypes.${v}`) })),
    [t],
  );
  const companyTypeOptions = useMemo(
    () =>
      COMPANY_TYPE_VALUES.map((v) => ({
        value: v,
        label: t(`companyTypes.${v}`),
      })),
    [t],
  );

  function validate(): string[] {
    const errs: string[] = [];
    if (!legalName.trim()) errs.push("legalName");
    // only digits and dots, and at least one digit (rejects empty and a bare ".")
    if (!/^[0-9.]+$/.test(idCode.trim()) || !/\d/.test(idCode))
      errs.push("idCode");
    if (!brandName.trim()) errs.push("brandName");
    if (!isValidGePhone(phone)) errs.push("phone");
    if (!city.trim()) errs.push("city");
    if (!address.trim()) errs.push("address");
    return errs;
  }

  async function handleSubmit() {
    if (!user) return;
    const errs = validate();
    if (errs.length) {
      setInvalid(new Set(errs));
      setError("შეავსეთ სავალდებულო ველები სწორად");
      return;
    }
    setInvalid(new Set());
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "create_organization",
        {
          p_org_type: orgType,
          p_legal_name: legalName.trim(),
          p_identification_code: idCode.trim(),
          p_brand_name: brandName.trim(),
          p_company_type: companyType,
          p_logo_url: logoUrl ?? undefined,
          p_cover_url: coverUrl ?? undefined,
          p_phone: phone ? `+995${phone}` : undefined,
          p_website: website.trim() || undefined,
          p_city: city || undefined,
          p_address: address.trim() || undefined,
          p_lat: coords?.lat ?? undefined,
          p_lng: coords?.lng ?? undefined,
        },
      );
      if (rpcError) throw rpcError;
      const orgId = data as unknown as string;
      router.push(`/dashboard/seller/organizations/${orgId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setLoading(false);
    }
  }

  return (
    <WizardShell
      title={t("regTitle")}
      subtitle={t("regProcess")}
      accent="green"
      progressPercent={100}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      footer={
        <WizardFooter
          accent="green"
          backHref="/dashboard/seller/organizations"
          backLabel={t("cancel")}
          submitLabel={t("submit")}
          submitDisabled={loading}
          loading={loading}
          error={error}
        />
      }
    >
      <div className="space-y-8">
        <WizardInnerCard number={1} title={t("sectionGeneral")} accent="green">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("orgType")} required>
              <StyledSelect
                value={orgType}
                onValueChange={setOrgType}
                options={orgTypeOptions}
                accent="green"
              />
            </Field>
            <Field
              label={t("legalName")}
              hint={t("legalNameHint")}
              required
              error={invalid.has("legalName")}
            >
              <input
                className={inputClass}
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder={t("legalNamePlaceholder")}
              />
            </Field>
            <Field
              label={t("idCode")}
              hint={t("idCodeHint")}
              required
              error={invalid.has("idCode")}
            >
              <input
                className={inputClass}
                value={idCode}
                inputMode="decimal"
                onChange={(e) =>
                  setIdCode(e.target.value.replace(/[^0-9.]/g, "").slice(0, 14))
                }
                placeholder={t("idCodePlaceholder")}
              />
            </Field>
            <Field
              label={t("brandName")}
              hint={t("brandNameHint")}
              required
              error={invalid.has("brandName")}
            >
              <input
                className={inputClass}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={t("brandNamePlaceholder")}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("companyType")} required>
                <StyledSelect
                  value={companyType}
                  onValueChange={setCompanyType}
                  options={companyTypeOptions}
                  accent="green"
                />
              </Field>
            </div>
          </div>
        </WizardInnerCard>

        <WizardInnerCard number={2} title={t("sectionBranding")} accent="green">
          <div className="grid gap-5 sm:grid-cols-2">
            {user && (
              <>
                <SingleImageUploader
                  value={logoUrl}
                  onChange={setLogoUrl}
                  userId={user.id}
                  label={t("uploadLogo")}
                  hint={t("uploadLogoHint")}
                  variant="logo"
                  accent="green"
                />
                <SingleImageUploader
                  value={coverUrl}
                  onChange={setCoverUrl}
                  userId={user.id}
                  label={t("uploadCover")}
                  hint={t("uploadCoverHint")}
                  variant="cover"
                  accent="green"
                />
              </>
            )}
          </div>
        </WizardInnerCard>

        <WizardInnerCard number={3} title={t("sectionContact")} accent="green">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("phone")} required error={invalid.has("phone")}>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                error={invalid.has("phone") ? "არასწორი ნომერი" : null}
              />
            </Field>
            <Field label={t("website")} hint={t("websiteHint")}>
              <input
                className={inputClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t("websitePlaceholder")}
              />
            </Field>
            <Field label={t("city")} required error={invalid.has("city")}>
              <SearchableSelect
                value={city}
                onValueChange={setCity}
                options={GEORGIAN_CITY_OPTIONS}
                placeholder={t("cityPlaceholder")}
                accent="green"
              />
            </Field>
            <Field label={t("address")} required error={invalid.has("address")}>
              <input
                className={inputClass}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("addressPlaceholder")}
              />
            </Field>
          </div>
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-[#334155]">
              {t("mapHint")}
            </label>
            <ExactLocationPicker value={coords} onChange={setCoords} />
          </div>
        </WizardInnerCard>
      </div>
    </WizardShell>
  );
}
