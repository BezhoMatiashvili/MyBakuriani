"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, MapPin } from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { trackMenuOpen } from "@/lib/menu-tracking";
import { safeHttpsUrl } from "@/lib/security";

interface Props {
  phone: string | null;
  menuUrl: string | null;
  location: string | null;
  serviceId?: string | null;
}

export function FoodContactCard({
  phone,
  menuUrl,
  location,
  serviceId,
}: Props) {
  const t = useTranslations("FoodDetail");

  // DB-sourced and owner-typed; must never reach an <a href> unvalidated
  // (a non-https value, e.g. `javascript:`, becomes a stored-XSS href).
  const safeMenuUrl = menuUrl ? safeHttpsUrl(menuUrl) : null;

  // Google Maps search query, not visible UI — Georgian "ბაკურიანი" matches
  // the Georgian location strings stored in the DB for geocoding.
  const mapsHref = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${location} ბაკურიანი`,
      )}`
    : null;

  return (
    <div className="rounded-[20px] border border-[#E2E8F0] bg-white p-6">
      <h3 className="mb-4 text-[16px] font-bold text-[#1E293B]">
        {t("contactAndActions")}
      </h3>

      <div className="space-y-3">
        {safeMenuUrl && (
          <a
            href={safeMenuUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackMenuOpen(serviceId)}
            className="flex h-[55px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
          >
            <ExternalLink className="h-4 w-4" />
            {t("menuLink")}
          </a>
        )}

        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-[55px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
          >
            <MapPin className="h-4 w-4" />
            {t("viewLocation")}
          </a>
        )}

        <CallButton
          phone={phone}
          label={t("getInTouch")}
          className="w-full rounded-2xl"
          layout="card"
          size="lg"
          serviceId={serviceId}
        />
      </div>
    </div>
  );
}
