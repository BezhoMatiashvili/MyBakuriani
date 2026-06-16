"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import { useTranslations } from "next-intl";
import NumberField from "@/components/shared/NumberField";
import { SkierLoader } from "@/components/shared/SkierLoader";

const BAKURIANI_CENTER = { lat: 41.7509, lng: 43.5294 };
const containerStyle = { width: "100%", height: "100%" };

let scriptLoadPromise: Promise<void> | null = null;
let mapsLoaded = false;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoaded) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && window.google?.maps) {
      mapsLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      mapsLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

interface ExactLocationPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

export default function ExactLocationPicker({
  value,
  onChange,
}: ExactLocationPickerProps) {
  const t = useTranslations("ExactLocationPicker");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [isLoaded, setIsLoaded] = useState(mapsLoaded);
  const [latInput, setLatInput] = useState(value ? String(value.lat) : "");
  const [lngInput, setLngInput] = useState(value ? String(value.lng) : "");

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => setIsLoaded(true));
  }, [apiKey]);

  useEffect(() => {
    setLatInput(value ? String(value.lat) : "");
    setLngInput(value ? String(value.lng) : "");
  }, [value]);

  const handleMapClick = useCallback(
    (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      onChange({
        lat: Number(event.latLng.lat().toFixed(6)),
        lng: Number(event.latLng.lng().toFixed(6)),
      });
    },
    [onChange],
  );

  const tryApplyManualCoordinates = useCallback(
    (nextLatInput: string, nextLngInput: string) => {
      const lat = Number(nextLatInput);
      const lng = Number(nextLngInput);
      const hasValidNumbers = Number.isFinite(lat) && Number.isFinite(lng);
      const inRange = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

      if (!hasValidNumbers || !inRange) return;

      onChange({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      });
    },
    [onChange],
  );

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-[#64748B]">
        {t("missingApiKey")}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
        <SkierLoader variant="inline" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-[240px] overflow-hidden rounded-xl border border-[#E2E8F0]">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={value ?? BAKURIANI_CENTER}
          zoom={value ? 15 : 13}
          onClick={handleMapClick}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            gestureHandling: "greedy",
          }}
        >
          {value && <MarkerF position={value} />}
        </GoogleMap>
      </div>
      <p className="text-xs text-[#64748B]">{t("clickHint")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#334155]">Latitude</label>
          <NumberField
            value={latInput}
            onChange={(nextLat) => {
              setLatInput(nextLat);
              tryApplyManualCoordinates(nextLat, lngInput);
            }}
            min={-90}
            max={90}
            decimals={6}
            allowNegative
            placeholder="41.750900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#334155]">
            Longitude
          </label>
          <NumberField
            value={lngInput}
            onChange={(nextLng) => {
              setLngInput(nextLng);
              tryApplyManualCoordinates(latInput, nextLng);
            }}
            min={-180}
            max={180}
            decimals={6}
            allowNegative
            placeholder="43.529400"
          />
        </div>
      </div>
      <p className="text-xs text-[#64748B]">{t("manualHint")}</p>
      {value && (
        <p className="text-xs font-medium text-[#334155]">
          {t("selectedCoords", {
            lat: String(value.lat),
            lng: String(value.lng),
          })}
        </p>
      )}
    </div>
  );
}
