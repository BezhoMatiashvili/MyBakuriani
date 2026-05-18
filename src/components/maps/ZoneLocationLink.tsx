"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import Modal from "@/components/shared/Modal";
import { useActiveZones } from "@/lib/zones/client";
import { resolveZone } from "@/lib/zones/types";
import { cn } from "@/lib/utils";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
});

interface ZoneLocationLinkProps {
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  className?: string;
  iconClassName?: string;
  /** Prefix before the zone name. Defaults to "ბაკურიანი, ". Pass "" to omit. */
  prefix?: string;
  /** Whether to render the leading MapPin icon. Default true. */
  showIcon?: boolean;
}

export default function ZoneLocationLink({
  location,
  lat,
  lng,
  className,
  iconClassName,
  prefix = "ბაკურიანი, ",
  showIcon = true,
}: ZoneLocationLinkProps) {
  const { zones } = useActiveZones();
  const [open, setOpen] = useState(false);
  const zone = useMemo(
    () => resolveZone(zones, location, lat, lng),
    [zones, location, lat, lng],
  );

  if (!zone) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        {showIcon && (
          <MapPin className={cn("h-4 w-4 shrink-0", iconClassName)} />
        )}
        {location ?? "—"}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 text-left transition-colors hover:text-[#0F172A] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 rounded",
          className,
        )}
        aria-label={`${zone.name_ka} — ნახე რუკაზე`}
      >
        {showIcon && (
          <MapPin className={cn("h-4 w-4 shrink-0", iconClassName)} />
        )}
        <span>
          {prefix}
          {zone.name_ka}
        </span>
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={zone.name_ka}
        size="lg"
      >
        <div className="h-[60vh] w-full overflow-hidden rounded-xl border border-[#E2E8F0]">
          <BakurianiMap
            className="h-full w-full"
            center={{ lat: zone.lat, lng: zone.lng }}
            zoom={15}
            zones={[zone]}
          />
        </div>
        {zone.description_ka && (
          <p className="mt-3 text-[14px] font-medium text-[#64748B]">
            {zone.description_ka}
          </p>
        )}
      </Modal>
    </>
  );
}
