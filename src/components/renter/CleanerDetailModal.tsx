"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Clock3,
  Languages,
  MapPin,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import Modal from "@/components/shared/Modal";
import { CallButton } from "@/components/shared/CallButton";
import {
  optionKeyFor,
  priceUnitPathFor,
  type OptionGroup,
} from "@/lib/constants/listing-options";
import { formatPrice } from "@/lib/utils/format";

export interface CleanerServiceProfile {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  languages: string[] | null;
  schedule: string | null;
  experience: string | null;
  serviceField: string | null;
  price: number | null;
  priceUnit: string | null;
  photoUrl: string | null;
}

export interface PlatformCleanerProfile {
  kind: "platform";
  id: string;
  name: string;
  avatarUrl: string | null;
  isOnline: boolean;
  isVerified: boolean;
  rentersServed: number;
  services: CleanerServiceProfile[];
}

export interface ManualCleanerProfile {
  kind: "manual";
  id: string;
  name: string;
  phone: string | null;
  available: boolean;
  location: string | null;
  description: string | null;
  experienceYears: number | null;
  languages: string[] | null;
  schedule: string | null;
  priceStandard: number | null;
  priceGeneral: number | null;
}

export type CleanerProfileView =
  | PlatformCleanerProfile
  | ManualCleanerProfile;

interface CleanerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CleanerProfileView | null;
  mode?: "add" | "saved";
  saved?: boolean;
  saving?: boolean;
  saveError?: boolean;
  onToggleSaved?: (profile: PlatformCleanerProfile) => void;
  onCallOut?: (
    profile: PlatformCleanerProfile,
    service: CleanerServiceProfile,
  ) => void;
  onEditManual?: (profile: ManualCleanerProfile) => void;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join(".");
}

function splitLocations(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function CleanerDetailModal({
  isOpen,
  onClose,
  profile,
  mode = "saved",
  saved = false,
  saving = false,
  saveError = false,
  onToggleSaved,
  onCallOut,
  onEditManual,
}: CleanerDetailModalProps) {
  const t = useTranslations("RenterCleaners");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");

  const optionLabel = (group: OptionGroup, value: string) => {
    const key = optionKeyFor(group, value);
    return key ? tOpts(`${group}.${key}`) : value;
  };

  const experienceLabel = (value: string | null) => {
    if (!value) return null;
    const key = optionKeyFor("experienceOptions", value);
    if (key) return tOpts(`experienceOptions.${key}`);
    const years = value.match(/^(\d+)\s*წელი$/u);
    return years
      ? t("yearsExperience", { count: Number(years[1]) })
      : value;
  };

  if (!profile) return null;

  const platformLocations =
    profile.kind === "platform"
      ? Array.from(
          new Set(
            profile.services.flatMap((service) =>
              splitLocations(service.location),
            ),
          ),
        )
      : [];
  const platformLanguages =
    profile.kind === "platform"
      ? Array.from(
          new Set(profile.services.flatMap((service) => service.languages ?? [])),
        )
      : [];
  const avatarUrl =
    profile.kind === "platform"
      ? profile.avatarUrl ?? profile.services[0]?.photoUrl ?? null
      : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("profileTitle")}
      size="lg"
      bodyClassName="space-y-6"
    >
      <div className="flex items-start gap-4">
        {avatarUrl ? (
          <span className="relative block size-16 shrink-0 overflow-hidden rounded-2xl bg-[#F1F5F9]">
            <Image
              src={avatarUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          </span>
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[17px] font-black text-[#2563EB]">
            {initials(profile.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[20px] font-black text-[#0F172A]">
              {profile.name}
            </h3>
            {profile.kind === "platform" && profile.isVerified && (
              <BadgeCheck
                className="size-5 text-[#2563EB]"
                aria-label={t("verified")}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-[11px] font-bold text-[#2563EB]">
              {profile.kind === "platform"
                ? t("sourcePlatform")
                : t("sourceManual")}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                (profile.kind === "platform"
                  ? profile.isOnline
                  : profile.available)
                  ? "bg-[#DCFCE7] text-[#15803D]"
                  : "bg-[#F1F5F9] text-[#64748B]"
              }`}
            >
              {(profile.kind === "platform"
                ? profile.isOnline
                : profile.available)
                ? t("available")
                : t("unavailable")}
            </span>
          </div>
        </div>
      </div>

      {profile.kind === "platform" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoCard
              icon={<MapPin className="size-4" />}
              label={t("coverageArea")}
              value={
                platformLocations.length
                  ? platformLocations
                      .map((zone) => optionLabel("coverageZones", zone))
                      .join(", ")
                  : t("notProvided")
              }
            />
            <InfoCard
              icon={<Languages className="size-4" />}
              label={t("languages")}
              value={
                platformLanguages.length
                  ? platformLanguages
                      .map((language) => optionLabel("languages", language))
                      .join(", ")
                  : t("notProvided")
              }
            />
            <InfoCard
              icon={<Users className="size-4" />}
              label={t("rentersLabel")}
              value={
                profile.rentersServed > 0
                  ? `${profile.rentersServed} ${t("rentersServed", { count: profile.rentersServed })}`
                  : t("rentersServedNone")
              }
            />
          </div>

          <section>
            <h4 className="mb-3 flex items-center gap-2 text-[15px] font-black text-[#0F172A]">
              <Sparkles className="size-4 text-[#2563EB]" />
              {t("services")}
            </h4>
            <div className="space-y-3">
              {profile.services.map((service) => {
                const unitPath = priceUnitPathFor(service.priceUnit);
                return (
                  <article
                    key={service.id}
                    className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
                    data-testid={`cleaner-service-${service.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h5 className="text-[14px] font-black text-[#0F172A]">
                          {service.title}
                        </h5>
                        {service.serviceField && (
                          <p className="mt-1 text-[12px] font-bold text-[#2563EB]">
                            {optionLabel("serviceSpheres", service.serviceField)}
                          </p>
                        )}
                      </div>
                      {service.price != null && (
                        <p className="shrink-0 text-[14px] font-black text-[#0F172A]">
                          {formatPrice(Number(service.price))}
                          {unitPath && (
                            <span className="text-[11px] font-semibold text-[#64748B]">
                              {" "}/ {tOpts(unitPath)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {service.description && (
                      <p className="mt-3 whitespace-pre-line text-[13px] font-medium leading-5 text-[#475569]">
                        {service.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#64748B]">
                      {service.location && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1">
                          <MapPin className="size-3" />
                          {splitLocations(service.location)
                            .map((zone) =>
                              optionLabel("coverageZones", zone),
                            )
                            .join(", ")}
                        </span>
                      )}
                      {service.schedule && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1">
                          <Clock3 className="size-3" />
                          {service.schedule}
                        </span>
                      )}
                      {service.experience && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1">
                          <BadgeCheck className="size-3" />
                          {experienceLabel(service.experience)}
                        </span>
                      )}
                    </div>
                    {mode === "saved" && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <CallButton
                          phone={null}
                          serviceId={service.id}
                          label={tShared("call")}
                          alwaysShowLabel
                          layout="card"
                          className="w-full"
                        />
                        <button
                          type="button"
                          onClick={() => onCallOut?.(profile, service)}
                          className="min-h-11 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1E40AF]"
                        >
                          {t("callOut")}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {mode === "add" && (
            <div>
              {saveError && (
                <p className="mb-3 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[12px] font-bold text-[#DC2626]">
                  {t("addModal.error")}
                </p>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => onToggleSaved?.(profile)}
                className={`min-h-11 w-full rounded-xl px-5 text-[13px] font-black transition-colors disabled:opacity-60 ${
                  saved
                    ? "border border-[#E2E8F0] bg-white text-[#DC2626] hover:bg-[#FEF2F2]"
                    : "bg-[#0F172A] text-white hover:bg-[#1E293B]"
                }`}
              >
                {saved ? t("addModal.remove") : t("addModal.add")}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard
              icon={<MapPin className="size-4" />}
              label={t("coverageArea")}
              value={profile.location ?? t("notProvided")}
            />
            <InfoCard
              icon={<BadgeCheck className="size-4" />}
              label={t("experience")}
              value={
                profile.experienceYears != null
                  ? t("yearsExperience", { count: profile.experienceYears })
                  : t("notProvided")
              }
            />
            <InfoCard
              icon={<Languages className="size-4" />}
              label={t("languages")}
              value={
                profile.languages?.length
                  ? profile.languages
                      .map((language) => optionLabel("languages", language))
                      .join(", ")
                  : t("notProvided")
              }
            />
            <InfoCard
              icon={<Clock3 className="size-4" />}
              label={t("schedule")}
              value={profile.schedule ?? t("notProvided")}
            />
          </div>

          <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <h4 className="flex items-center gap-2 text-[13px] font-black text-[#0F172A]">
              <Sparkles className="size-4 text-[#2563EB]" />
              {t("capabilities")}
            </h4>
            <p className="mt-2 whitespace-pre-line text-[13px] font-medium leading-5 text-[#475569]">
              {profile.description ?? t("manualIncomplete")}
            </p>
            {(profile.priceStandard != null || profile.priceGeneral != null) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.priceStandard != null && (
                  <PricePill
                    label={t("priceStandardShort")}
                    value={profile.priceStandard}
                  />
                )}
                {profile.priceGeneral != null && (
                  <PricePill
                    label={t("priceGeneralShort")}
                    value={profile.priceGeneral}
                  />
                )}
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <CallButton
              phone={profile.phone}
              label={tShared("call")}
              alwaysShowLabel
              layout="card"
              className="w-full"
            />
            <button
              type="button"
              onClick={() => onEditManual?.(profile)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F3E8FF] px-4 text-[13px] font-bold text-[#7E22CE] transition-colors hover:bg-[#E9D5FF]"
            >
              <Pencil className="size-4" />
              {tShared("edit")}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#F8FAFC] p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-[13px] font-black leading-5 text-[#0F172A]">
        {value}
      </p>
    </div>
  );
}

function PricePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#64748B]">
      {label} <strong className="text-[#0F172A]">{formatPrice(value)}</strong>
    </span>
  );
}
