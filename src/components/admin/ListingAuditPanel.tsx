"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, formatPrice } from "@/lib/utils/format";
import type {
  AuditPayload,
  AuditPropertyListing,
  AuditServiceListing,
} from "@/app/api/admin/listings/audit/route";

type Props = {
  kind: "property" | "service";
  id: string;
  busy: boolean;
  onAction: (action: "approve" | "reject", notes: string) => void;
};

const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  food: "კვება",
  transport: "ტრანსპორტი",
  entertainment: "გართობა",
  employment: "სამუშაო",
  handyman: "ხელოსანი",
  cleaning: "დასუფთავება",
};

export default function ListingAuditPanel({ kind, id, busy, onAction }: Props) {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let active = true;
    setLoadErr(null);
    setData(null);
    async function load() {
      try {
        const res = await fetch(
          `/api/admin/listings/audit?kind=${kind}&id=${id}`,
          { cache: "no-store" },
        );
        const payload = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(payload.error ?? "დეტალები ვერ ჩაიტვირთა");
        setData(payload as AuditPayload);
      } catch (err) {
        if (!active) return;
        setLoadErr(err instanceof Error ? err.message : "შეცდომა");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [kind, id]);

  if (loadErr) {
    return (
      <div className="m-4 flex items-center gap-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm font-semibold text-[#B91C1C]">
        <AlertCircle className="h-5 w-5" />
        {loadErr}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl md:col-span-2" />
      </div>
    );
  }

  const { owner } = data;
  const isProperty = data.kind === "property";
  const napr = isProperty
    ? (data.listing as AuditPropertyListing).cadastral_code
    : null;

  return (
    <div className="space-y-4 bg-[#F8FAFC] p-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Owner card */}
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#475569]">
            <UserIcon className="h-4 w-4" />
            მესაკუთრის ინფო
            {owner.is_verified && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
                <BadgeCheck className="h-3 w-3" />
                ვერიფიცირებული
              </span>
            )}
          </div>
          <dl className="space-y-3 text-sm">
            <Row icon={<UserIcon className="h-4 w-4" />} label="სახელი">
              {owner.display_name ?? "—"}
            </Row>
            <Row icon={<Phone className="h-4 w-4" />} label="ტელეფონი">
              {formatPhone(owner.phone)}
            </Row>
            <Row icon={<Mail className="h-4 w-4" />} label="ელ-ფოსტა">
              {owner.email ?? "—"}
            </Row>
            <Row
              icon={<ShieldCheck className="h-4 w-4" />}
              label="პირადი ნომერი"
            >
              <span className="font-mono">{owner.personal_id ?? "—"}</span>
            </Row>
          </dl>
        </div>

        {/* NAPR card — property only */}
        {isProperty && (
          <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
            <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#1D4ED8]">
              <Building2 className="h-4 w-4" />
              იურიდიული (NAPR)
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="საკადასტრო კოდი">
                <span className="font-mono text-[15px] font-bold text-[#0F172A]">
                  {napr ?? "—"}
                </span>
              </Row>
              <Row label="წყარო">
                <a
                  href="https://napr.gov.ge/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#1D4ED8] hover:underline"
                >
                  napr.gov.ge
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Row>
              <Row icon={<MapPin className="h-4 w-4" />} label="მისამართი">
                {(data.listing as AuditPropertyListing).location ?? "—"}
              </Row>
            </dl>
            {/* TODO: NAPR-match + Facebook-group checkboxes — deferred (no DB columns yet) */}
          </div>
        )}

        {/* Listing details */}
        <div
          className={`rounded-2xl border border-[#E2E8F0] bg-white p-5 ${isProperty ? "md:col-span-2" : ""}`}
        >
          <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#475569]">
            განცხადების დეტალები
          </div>
          {isProperty ? (
            <PropertyDetails listing={data.listing as AuditPropertyListing} />
          ) : (
            <ServiceDetails listing={data.listing as AuditServiceListing} />
          )}
        </div>
      </div>

      {/* Admin comment + actions */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
        <label
          htmlFor={`audit-notes-${id}`}
          className="mb-2 block text-[13px] font-extrabold uppercase tracking-[0.6px] text-[#475569]"
        >
          ადმინისტრატორის კომენტარი
        </label>
        <textarea
          id={`audit-notes-${id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="დაამატე შენიშვნა ან მიზეზი (არასავალდებულო დადასტურებისას)…"
          rows={3}
          className="w-full resize-y rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("reject", notes.trim())}
            className="inline-flex h-12 min-h-[44px] items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-5 text-sm font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            ვარყოფ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction("approve", notes.trim())}
            className="inline-flex h-12 min-h-[44px] items-center gap-2 rounded-xl bg-[#059669] px-6 text-sm font-bold text-white shadow-[0px_8px_20px_rgba(5,150,105,0.25)] transition-colors hover:bg-[#047857] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            დადასტურება
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-[14px] font-semibold text-[#0F172A]">
        {children}
      </dd>
    </div>
  );
}

function PhotoStrip({ photos }: { photos: string[] }) {
  if (!photos.length) {
    return <p className="text-sm text-[#94A3B8]">ფოტო არ არის ატვირთული</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {photos.slice(0, 6).map((src, idx) => (
        <div
          key={`${src}-${idx}`}
          className="relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]"
        >
          <Image
            src={src}
            alt={`photo ${idx + 1}`}
            fill
            sizes="128px"
            className="object-cover"
            unoptimized
          />
        </div>
      ))}
      {photos.length > 6 && (
        <div className="flex h-24 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-sm font-bold text-[#475569]">
          +{photos.length - 6}
        </div>
      )}
    </div>
  );
}

function PropertyDetails({ listing }: { listing: AuditPropertyListing }) {
  const isSale = listing.sale_price != null;
  const price = isSale ? listing.sale_price : listing.price_per_night;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[18px] font-black text-[#0F172A]">{listing.title}</p>
        {price != null && (
          <p className="text-[20px] font-black text-[#2563EB]">
            {formatPrice(price)}
            {!isSale && (
              <span className="text-sm font-semibold text-[#64748B]">
                {" "}
                / ღამე
              </span>
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Stat label="ოთახი" value={listing.rooms} />
        <Stat label="სველი წერტ." value={listing.bathrooms} />
        <Stat label="ფართი" value={listing.area_sqm} suffix=" მ²" />
        <Stat label="ტევადობა" value={listing.capacity} />
      </div>
      {listing.description && (
        <p className="line-clamp-6 text-sm leading-6 text-[#475569]">
          {listing.description}
        </p>
      )}
      <PhotoStrip photos={listing.photos} />
    </div>
  );
}

function ServiceDetails({ listing }: { listing: AuditServiceListing }) {
  const catLabel = SERVICE_CATEGORY_LABEL[listing.category] ?? listing.category;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[18px] font-black text-[#0F172A]">{listing.title}</p>
        {listing.price != null && (
          <p className="text-[20px] font-black text-[#2563EB]">
            {formatPrice(listing.price)}
            {listing.price_unit && (
              <span className="text-sm font-semibold text-[#64748B]">
                {" "}
                / {listing.price_unit}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="კატეგორია" value={catLabel} />
        {listing.location && (
          <Stat label="მისამართი" value={listing.location} />
        )}
        {listing.phone && (
          <Stat label="ტელეფონი" value={formatPhone(listing.phone)} />
        )}
        {listing.cuisine_type && (
          <Stat label="სამზარეულო" value={listing.cuisine_type} />
        )}
        {listing.route && <Stat label="მარშრუტი" value={listing.route} />}
        {listing.position && <Stat label="პოზიცია" value={listing.position} />}
        {listing.salary_range && (
          <Stat label="ანაზღაურება" value={listing.salary_range} />
        )}
      </div>
      {listing.description && (
        <p className="line-clamp-6 text-sm leading-6 text-[#475569]">
          {listing.description}
        </p>
      )}
      <PhotoStrip photos={listing.photos} />
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-[#EDF2F7] bg-[#F8FAFC] px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-1 text-[14px] font-bold text-[#0F172A]">
        {value != null && value !== "" ? `${value}${suffix ?? ""}` : "—"}
      </p>
    </div>
  );
}
