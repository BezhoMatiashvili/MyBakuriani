"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";

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
        ზუსტი ლოკაციის ასარჩევად დაამატეთ `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-[240px] animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]" />
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
      <p className="text-xs text-[#64748B]">
        რუკაზე დააჭირეთ სასურველ წერტილს ზუსტი მდებარეობის ასარჩევად.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#334155]">Latitude</label>
          <input
            type="number"
            step="0.000001"
            value={latInput}
            onChange={(e) => {
              const nextLat = e.target.value;
              setLatInput(nextLat);
              tryApplyManualCoordinates(nextLat, lngInput);
            }}
            placeholder="41.750900"
            className="h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-[#334155]">
            Longitude
          </label>
          <input
            type="number"
            step="0.000001"
            value={lngInput}
            onChange={(e) => {
              const nextLng = e.target.value;
              setLngInput(nextLng);
              tryApplyManualCoordinates(latInput, nextLng);
            }}
            placeholder="43.529400"
            className="h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
          />
        </div>
      </div>
      <p className="text-xs text-[#64748B]">
        შეგიძლიათ ხელითაც ჩაწეროთ კოორდინატები (lat/lng).
      </p>
      {value && (
        <p className="text-xs font-medium text-[#334155]">
          არჩეული კოორდინატები: {value.lat}, {value.lng}
        </p>
      )}
    </div>
  );
}
