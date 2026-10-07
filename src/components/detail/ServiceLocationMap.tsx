"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { SkierLoader } from "@/components/shared/SkierLoader";
import LazyOnVisible from "@/components/shared/LazyOnVisible";
import type { MapProperty } from "@/components/maps/BakurianiMap";
import type { LatLng } from "@/lib/maps/googleMapsUrl";

const BakurianiMap = dynamic(
  () =>
    import("@/components/maps/BakurianiMap").then((mod) =>
      mod.canvasReady.then(() => mod),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[300px] items-center justify-center rounded-2xl bg-[#F1F5F9]">
        <SkierLoader variant="inline" />
      </div>
    ),
  },
);

interface Props {
  id: string;
  title: string;
  coords: LatLng;
  photo?: string;
}

/**
 * A service listing's own pin (food, entertainment) with the same
 * "show me the route" control as the apartment, hotel and sale pages (C38).
 */
export default function ServiceLocationMap({
  id,
  title,
  coords,
  photo,
}: Props) {
  const t = useTranslations("PropertyDetail");
  // The listing goes in as a marker (a bare `center` draws zone pins), with
  // no price, so it shows a pin. Stable identity: the map rebuilds every
  // marker whenever this array changes.
  const markers = useMemo<MapProperty[]>(
    () => [{ id, title, lat: coords.lat, lng: coords.lng, photo }],
    [id, title, coords.lat, coords.lng, photo],
  );

  return (
    <>
      <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
        {t("exactLocation")}
      </h2>
      <div className="h-[300px] overflow-hidden rounded-2xl border border-[#E2E8F0]">
        <LazyOnVisible className="h-full w-full">
          <BakurianiMap
            className="h-full w-full"
            center={coords}
            properties={markers}
            zoom={15}
            showRouteButton
          />
        </LazyOnVisible>
      </div>
    </>
  );
}
