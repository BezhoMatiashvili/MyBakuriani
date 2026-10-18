"use client";

import {
  ExternalLink,
  FileText,
  MessageCircle,
  Navigation,
  Phone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { priceUnitPathFor } from "@/lib/constants/listing-options";
import { listingLinkTarget, type CleanerTaskItem } from "@/lib/cleaner/tasks";
import { googleMapsDirectionsUrl } from "@/lib/maps/googleMapsUrl";
import { normalizeE164Phone } from "@/lib/security";
import { formatPhone } from "@/lib/utils/format";
import { propertyViewUrl } from "@/lib/utils/listingUrls";

/**
 * Pieces of a platform call-out a cleaner needs before and after accepting it.
 * Shared by the dashboard cards and the schedule page so both show the same
 * facts: which apartment it is, the owner's number, the note they wrote, a way
 * to get there, and what the price is per.
 */

const CONTACT_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[12px] font-bold text-white transition-colors";

/**
 * The owner's number (and WhatsApp) as tappable buttons. Only a normalized
 * Georgian mobile becomes a `tel:`/wa.me link; any other stored value is still
 * shown as text so the cleaner can read it.
 */
export function TaskContact({ task }: { task: CleanerTaskItem }) {
  const t = useTranslations("CleanerDashboard");

  // No details row at all means the lookup failed (or lost a race with the
  // call-out being created): that is not the same as "the owner left no number".
  if (!task.detailsLoaded) {
    return (
      <p
        data-testid="cleaner-task-details-unavailable"
        className="text-[12px] font-medium text-[#92400E]"
      >
        {t("detailsUnavailable")}
      </p>
    );
  }

  const phone = task.contactPhone;
  const phoneE164 = normalizeE164Phone(phone);
  const whatsappE164 = normalizeE164Phone(task.contactWhatsapp);

  if (!phone && !whatsappE164) {
    return (
      <p
        data-testid="cleaner-task-phone-missing"
        className="text-[12px] font-medium text-[#64748B]"
      >
        {t("phoneMissing")}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {phone &&
        (phoneE164 ? (
          <a
            href={`tel:${phoneE164}`}
            aria-label={`${t("call")} ${formatPhone(phone)}`}
            data-jev-label={t("call")}
            data-testid="cleaner-task-call"
            className={`${CONTACT_BUTTON} bg-[#0369A1] hover:bg-[#075985]`}
          >
            <Phone className="size-4 shrink-0" />
            {formatPhone(phone)}
          </a>
        ) : (
          <span
            data-testid="cleaner-task-call"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#E2E8F0] px-4 text-[12px] font-bold text-[#0F172A]"
          >
            <Phone className="size-4 shrink-0" />
            {formatPhone(phone)}
          </span>
        ))}
      {whatsappE164 && (
        <a
          href={`https://wa.me/${whatsappE164.slice(1)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="cleaner-task-whatsapp"
          data-jev-label={t("whatsapp")}
          className={`${CONTACT_BUTTON} bg-[#15803D] hover:bg-[#166534]`}
        >
          <MessageCircle className="size-4 shrink-0" />
          {t("whatsapp")}
        </a>
      )}
    </div>
  );
}

/**
 * The apartment's name. A link to its public page only when it has one: the
 * public detail routes read `public_properties`, which is status = 'active'
 * only, so a draft the owner still sent a cleaner to must not get a 404 link.
 */
export function TaskTitle({
  task,
  fallback,
}: {
  task: CleanerTaskItem;
  fallback: string;
}) {
  const t = useTranslations("CleanerDashboard");
  const title = task.title ?? fallback;
  const target = listingLinkTarget(task);
  if (!target) return <>{title}</>;

  return (
    <Link
      href={propertyViewUrl(target)}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      data-testid="cleaner-task-listing-link"
      className="-my-3 inline-flex max-w-full items-start gap-1.5 py-3 hover:underline"
    >
      <span className="min-w-0 break-words">{title}</span>
      <ExternalLink
        className="mt-[5px] size-3.5 shrink-0 text-[#64748B]"
        aria-hidden
      />
      <span className="sr-only">{t("openListing")}</span>
    </Link>
  );
}

/** "65 m² · 2 rooms · 1 bathroom": what the apartment is, straight from its listing. */
export function TaskFacts({ task }: { task: CleanerTaskItem }) {
  const t = useTranslations("CleanerDashboard");
  const facts = [
    task.areaSqm != null && task.areaSqm > 0
      ? t("areaSqm", { area: task.areaSqm })
      : null,
    task.rooms != null && task.rooms > 0
      ? t("rooms", { count: task.rooms })
      : null,
    task.bathrooms != null && task.bathrooms > 0
      ? t("bathrooms", { count: task.bathrooms })
      : null,
  ].filter((fact): fact is string => fact !== null);
  if (facts.length === 0) return null;

  return (
    <p
      data-testid="cleaner-task-facts"
      className="mt-1 text-[12px] font-medium text-[#64748B]"
    >
      {facts.join(" · ")}
    </p>
  );
}

/**
 * Shown while a job is still ahead of the cleaner and its address is only the
 * listing's zone: the cleaner must ask for the rest. Once the job has started
 * the hint is moot, and "call the owner" is no help when there is no number.
 */
export function TaskAreaOnlyHint({ task }: { task: CleanerTaskItem }) {
  const t = useTranslations("CleanerDashboard");
  if (
    !task.addressAreaOnly ||
    task.status === "in_progress" ||
    task.status === "completed"
  ) {
    return null;
  }
  const noContact =
    !task.contactPhone && !normalizeE164Phone(task.contactWhatsapp);

  return (
    <p
      data-testid="cleaner-task-area-only"
      className="mt-1.5 text-[12px] font-medium leading-4 text-[#92400E]"
    >
      {t(noContact ? "areaOnlyNoPhoneHint" : "areaOnlyHint")}
    </p>
  );
}

/** Directions to the apartment's pin; nothing when the listing has no coordinates. */
export function TaskDirections({ task }: { task: CleanerTaskItem }) {
  const t = useTranslations("CleanerDashboard");
  if (task.propertyLat == null || task.propertyLng == null) return null;

  return (
    <a
      href={googleMapsDirectionsUrl({
        lat: task.propertyLat,
        lng: task.propertyLng,
      })}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="cleaner-task-directions"
      data-jev-label={t("directions")}
      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#EFF6FF] px-4 text-[12px] font-bold text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
    >
      <Navigation className="size-4 shrink-0" />
      {t("directions")}
    </a>
  );
}

/** The note the owner wrote for this job; nothing when they wrote none. */
export function TaskNotes({ notes }: { notes: string | null }) {
  const t = useTranslations("CleanerDashboard");
  const text = notes?.trim();
  if (!text) return null;

  return (
    <div
      data-testid="cleaner-task-notes"
      className="mt-4 rounded-2xl bg-[#F8FAFC] p-4"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.08em] text-[#64748B]">
        <FileText className="size-3.5 shrink-0" />
        {t("ownerNote")}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] font-medium leading-5 text-[#0F172A]">
        {text}
      </p>
    </div>
  );
}

/** " / საათი" after a price: what the price is per, translated from the stored unit. */
export function TaskPriceUnit({ unit }: { unit: string | null }) {
  const tOpts = useTranslations("ListingOptions");
  if (!unit) return null;
  const path = priceUnitPathFor(unit);

  return (
    <span className="ml-1 whitespace-nowrap text-[12px] font-bold text-[#64748B]">
      / {path ? tOpts(path) : unit}
    </span>
  );
}
