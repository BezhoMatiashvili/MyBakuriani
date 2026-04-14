"use client";

import { useCallback, useState } from "react";
import { GoogleMap, useJsApiLoader, MarkerF } from "@react-google-maps/api";
const BAKURIANI_CENTER = { lat: 41.7509, lng: 43.5294 };

const ZONES = [
  {
    id: "didveli",
    label: "დიდველი / კრისტალი",
    position: { lat: 41.7385, lng: 43.5175 },
  },
  {
    id: "centri",
    label: "ცენტრი / პარკი",
    position: { lat: 41.7509, lng: 43.5294 },
  },
  {
    id: "kokhta",
    label: "კოხტა / მიტარბი",
    position: { lat: 41.758, lng: 43.545 },
  },
  {
    id: "25",
    label: "25-იანები",
    position: { lat: 41.746, lng: 43.538 },
  },
];

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [{ color: "#0e1626" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#304a7d" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#255763" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#283d6a" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#1f2a44" }],
  },
];

const containerStyle = { width: "100%", height: "100%" };

interface BakurianiMapProps {
  className?: string;
  onZoneClick?: (zone: string) => void;
  embedded?: boolean;
}

export default function BakurianiMap({
  className,
  onZoneClick,
  embedded,
}: BakurianiMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: "bakuriani-map",
  });

  const [, setMap] = useState<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Zone dot positions (percentage-based for static fallback)
  const ZONE_POSITIONS: Record<string, { left: string; top: string }> = {
    didveli: { left: "28%", top: "18%" },
    centri: { left: "42%", top: "50%" },
    kokhta: { left: "52%", top: "32%" },
    "25": { left: "40%", top: "75%" },
  };

  // Extra decorative dots to match Figma (7 total)
  const DECORATIVE_DOTS = [
    { left: "65%", top: "25%" },
    { left: "75%", top: "55%" },
    { left: "60%", top: "70%" },
  ];

  // Fallback when no API key
  if (!apiKey || !isLoaded) {
    return (
      <div
        className={`relative overflow-hidden bg-[#F8FAFC] ${embedded ? "" : "min-h-[200px] rounded-[16px] border border-[#E2E8F0]"} ${className ?? ""}`}
      >
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(#94A3B8 1px, transparent 1px), linear-gradient(90deg, #94A3B8 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Terrain blob */}
        <div
          className="absolute rounded-[50%] bg-[#CBD5E1]/25"
          style={{
            left: "55%",
            top: "45%",
            width: "120px",
            height: "100px",
            transform: "translate(-50%, -50%) rotate(-15deg)",
          }}
        />

        {/* Purple zone dots (clickable) */}
        {ZONES.map((zone) => {
          const pos = ZONE_POSITIONS[zone.id];
          if (!pos) return null;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onZoneClick?.(zone.label)}
              className="absolute size-3 rounded-full border-[2px] border-white bg-[#A855F7] shadow-[0px_2px_6px_rgba(168,85,247,0.4)] transition-transform hover:scale-150"
              style={{ left: pos.left, top: pos.top }}
              title={zone.label}
            />
          );
        })}

        {/* Decorative dots (visual only) */}
        {DECORATIVE_DOTS.map((pos, i) => (
          <div
            key={i}
            className="absolute size-3 rounded-full border-[2px] border-white bg-[#A855F7] shadow-[0px_2px_6px_rgba(168,85,247,0.4)]"
            style={{ left: pos.left, top: pos.top }}
          />
        ))}

        {/* Map Controls (decorative) */}
        <div className="absolute right-3 top-3 flex flex-col rounded-lg border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.05)]">
          <span className="flex size-[34px] items-center justify-center border-b border-[#EEF1F4] text-[13px] font-bold text-[#334155]">
            +
          </span>
          <span className="flex size-[34px] items-center justify-center border-b border-[#EEF1F4] text-[13px] font-bold text-[#334155]">
            −
          </span>
          <span className="flex size-[34px] items-center justify-center text-[11px] font-bold text-[#334155]">
            3D
          </span>
        </div>

        {/* Location label */}
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-bold text-[#334155] shadow-sm backdrop-blur-sm">
          ბაკურიანი
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden ${embedded ? "" : "rounded-[16px] border border-white/5"} ${className ?? ""}`}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={BAKURIANI_CENTER}
        zoom={13}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          styles: MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: 3 },
        }}
      >
        {ZONES.map((zone) => (
          <MarkerF
            key={zone.id}
            position={zone.position}
            title={zone.label}
            onClick={() => onZoneClick?.(zone.label)}
            icon={{
              path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
              fillColor: "#2563EB",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: 1.5,
              anchor: new google.maps.Point(12, 22),
            }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}
