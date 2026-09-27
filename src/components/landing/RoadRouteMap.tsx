"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useUserLocation } from "@/lib/geolocation/useUserLocation";
import {
  fetchDrivingRoute,
  type LatLng,
  type RouteLineString,
} from "@/lib/maps/directions";
import { googleMapsDirectionsUrl } from "@/lib/maps/googleMapsUrl";
import {
  BAKURIANI_DESTINATION,
  TBILISI_ORIGIN,
} from "@/lib/road-condition/shared";
import type { RouteDisplay } from "@/components/maps/BakurianiMap";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
});

// The road card's expanded map + route, mounted only while the card is open
// (StatusCards.tsx special-cases card.id === "road", mirroring how it already
// special-cases "cameras" for its embedded iframe). Origin is the visitor's
// location when granted, the same fixed Tbilisi point the default card uses
// otherwise - so there is always a route to show.
export default function RoadRouteMap() {
  const t = useTranslations("BakurianiMap");
  const { coords } = useUserLocation();
  const [route, setRoute] = useState<RouteLineString | null>(null);
  const origin: LatLng = coords ?? TBILISI_ORIGIN;

  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
    void fetchDrivingRoute(origin, BAKURIANI_DESTINATION, token).then(
      (result) => {
        if (!cancelled) setRoute(result?.geojson ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng]);

  const display: RouteDisplay | null = route
    ? { origin, destination: BAKURIANI_DESTINATION, geojson: route }
    : null;

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <div className="h-[220px] w-full overflow-hidden rounded-xl border border-[#E2E8F0]">
        <BakurianiMap
          className="h-full w-full"
          embedded
          zones={[]}
          route={display}
        />
      </div>
      <a
        href={googleMapsDirectionsUrl(BAKURIANI_DESTINATION, coords)}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] font-bold text-[#334155] shadow-sm transition-colors hover:bg-[#F1F5F9]"
      >
        {t("openInGoogleMaps")}
      </a>
    </div>
  );
}
