"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleMap, OverlayViewF, MarkerF } from "@react-google-maps/api";

const BAKURIANI_CENTER = { lat: 41.7509, lng: 43.5294 };

// ── Singleton script loader (avoids useJsApiLoader duplicate-call bug) ──
let _loadPromise: Promise<void> | null = null;
let _loaded = false;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (_loaded) return Promise.resolve();
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && window.google?.maps) {
      _loaded = true;
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      _loaded = true;
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });

  return _loadPromise;
}

// ── Types ──
export interface MapProperty {
  id: string;
  title: string;
  price: number;
  lat: number;
  lng: number;
  isVip?: boolean;
  isSuperVip?: boolean;
  photo?: string;
}

interface BakurianiMapProps {
  className?: string;
  onZoneClick?: (zone: string) => void;
  embedded?: boolean;
  properties?: MapProperty[];
  onPropertyClick?: (id: string) => void;
  isForSale?: boolean;
  /** For detail pages: center map on a single location */
  center?: { lat: number; lng: number };
  zoom?: number;
  /** Show an expand button that opens a larger map overlay */
  expandable?: boolean;
}

// ── Zone data (backward compat fallback) ──
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

// ── Clean light Airbnb-style map theme ──
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c9c9c9" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry.fill",
    stylers: [{ color: "#e8f5e9" }],
  },
  {
    featureType: "poi",
    stylers: [{ visibility: "simplified" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#c8e6c9" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#757575" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#c8e6c9" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e0e0e0" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#dadada" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#b3d9ff" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9e9e9e" }],
  },
];

const containerStyle = { width: "100%", height: "100%" };

// ── Price formatting ──
function formatPrice(price: number, isForSale?: boolean): string {
  if (isForSale && price >= 1000) {
    return `${price.toLocaleString("ka-GE")} ₾`;
  }
  return `${price} ₾`;
}

// ── Price Marker Component ──
function PriceMarker({
  property,
  isSelected,
  isForSale,
  onClick,
  onNavigate,
}: {
  property: MapProperty;
  isSelected: boolean;
  isForSale?: boolean;
  onClick: () => void;
  onNavigate?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isVip = property.isSuperVip || property.isVip;

  return (
    <OverlayViewF
      position={{ lat: property.lat, lng: property.lng }}
      mapPaneName="floatPane"
      getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
    >
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Tooltip on hover — clickable to navigate */}
        {hovered && !isSelected && (
          <div
            className="absolute bottom-full left-1/2 z-50 mb-2 w-[180px] -translate-x-1/2 cursor-pointer overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_8px_24px_rgba(0,0,0,0.15)] transition-shadow hover:shadow-[0px_12px_32px_rgba(0,0,0,0.22)]"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.(property.id);
            }}
          >
            {property.photo && (
              <div
                className="h-[80px] w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${property.photo})` }}
              />
            )}
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-[11px] font-bold leading-tight text-[#1E293B]">
                {property.title}
              </p>
              <p className="mt-0.5 text-[12px] font-black text-[#2563EB]">
                {formatPrice(property.price, isForSale)}
              </p>
            </div>
          </div>
        )}

        {/* Price pill */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={`
            cursor-pointer whitespace-nowrap rounded-full px-3 py-2
            text-[12px] font-bold leading-none
            shadow-[0px_2px_8px_rgba(0,0,0,0.12)]
            transition-all duration-150
            hover:scale-110 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.2)]
            ${
              isSelected
                ? "z-50 scale-110 bg-[#1E293B] text-white shadow-[0px_4px_12px_rgba(0,0,0,0.3)]"
                : isVip
                  ? "border-2 border-[#F59E0B] bg-white text-[#1E293B]"
                  : "border border-[#E2E8F0] bg-white text-[#1E293B]"
            }
          `}
          title={property.title}
          style={{ minHeight: "32px", minWidth: "48px" }}
        >
          {formatPrice(property.price, isForSale)}
        </button>
      </div>
    </OverlayViewF>
  );
}

// ── Expand icon SVG (inline to avoid extra dependency) ──
function ExpandIcon({ className: cls }: { className?: string }) {
  return (
    <svg
      className={cls}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="5 1 1 1 1 5" />
      <polyline points="15 1 19 1 19 5" />
      <polyline points="19 15 19 19 15 19" />
      <polyline points="1 15 1 19 5 19" />
    </svg>
  );
}

function CollapseIcon({ className: cls }: { className?: string }) {
  return (
    <svg
      className={cls}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 5 5 5 5 1" />
      <polyline points="19 5 15 5 15 1" />
      <polyline points="15 19 15 15 19 15" />
      <polyline points="5 19 5 15 1 15" />
    </svg>
  );
}

// ── Main Component ──
export default function BakurianiMap({
  className,
  onZoneClick,
  embedded,
  properties,
  onPropertyClick,
  isForSale,
  center,
  zoom,
  expandable,
}: BakurianiMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

  const [isLoaded, setIsLoaded] = useState(_loaded);
  const [, setMap] = useState<google.maps.Map | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => setIsLoaded(true));
  }, [apiKey]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handlePropertyClick = useCallback(
    (id: string) => {
      setSelectedId((prev) => (prev === id ? null : id));
      onPropertyClick?.(id);
    },
    [onPropertyClick],
  );

  // Compute map center from properties if available
  const mapCenter =
    center ??
    (properties && properties.length > 0
      ? {
          lat:
            properties.reduce((sum, p) => sum + p.lat, 0) / properties.length,
          lng:
            properties.reduce((sum, p) => sum + p.lng, 0) / properties.length,
        }
      : BAKURIANI_CENTER);

  const hasProperties = properties && properties.length > 0;

  // ── Fallback static UI (zone dots) ──
  const ZONE_POSITIONS: Record<string, { left: string; top: string }> = {
    didveli: { left: "28%", top: "18%" },
    centri: { left: "42%", top: "50%" },
    kokhta: { left: "52%", top: "32%" },
    "25": { left: "40%", top: "75%" },
  };

  const DECORATIVE_DOTS = [
    { left: "65%", top: "25%" },
    { left: "75%", top: "55%" },
    { left: "60%", top: "70%" },
  ];

  if (!apiKey || !isLoaded) {
    return (
      <div
        className={`relative overflow-hidden bg-[#F8FAFC] ${embedded ? "" : "min-h-[200px] rounded-[16px] border border-[#E2E8F0]"} ${className ?? ""}`}
      >
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(#94A3B8 1px, transparent 1px), linear-gradient(90deg, #94A3B8 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
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
        {DECORATIVE_DOTS.map((pos, i) => (
          <div
            key={i}
            className="absolute size-3 rounded-full border-[2px] border-white bg-[#A855F7] shadow-[0px_2px_6px_rgba(168,85,247,0.4)]"
            style={{ left: pos.left, top: pos.top }}
          />
        ))}
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
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-bold text-[#334155] shadow-sm backdrop-blur-sm">
          ბაკურიანი
        </div>
      </div>
    );
  }

  const mapContent = (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={mapCenter}
      zoom={zoom ?? (hasProperties ? 14 : 13)}
      onLoad={onLoad}
      onUnmount={onUnmount}
      onClick={() => setSelectedId(null)}
      options={{
        styles: MAP_STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: 3 },
        clickableIcons: false,
      }}
    >
      {hasProperties
        ? properties.map((p) => (
            <PriceMarker
              key={p.id}
              property={p}
              isSelected={selectedId === p.id}
              isForSale={isForSale}
              onClick={() => handlePropertyClick(p.id)}
              onNavigate={onPropertyClick}
            />
          ))
        : ZONES.map((zone) => (
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
  );

  return (
    <>
      <div
        className={`relative overflow-hidden ${embedded ? "" : "rounded-[16px] border border-[#E2E8F0]"} ${className ?? ""}`}
      >
        {mapContent}

        {/* Expand button */}
        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute bottom-3 right-3 z-10 flex size-[36px] items-center justify-center rounded-lg border border-[#E2E8F0] bg-white shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9]"
            title="რუკის გაშლა"
          >
            <ExpandIcon className="size-4 text-[#334155]" />
          </button>
        )}
      </div>

      {/* Expanded modal overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 px-4 pb-6 pt-[200px] backdrop-blur-sm md:px-10 md:pb-10 md:pt-[200px]"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative h-full w-full max-w-[1100px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with collapse button */}
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3">
              <h3 className="text-[15px] font-black text-[#1E293B]">
                ბაკურიანის რუკა
              </h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[12px] font-bold text-[#334155] transition-colors hover:bg-[#F1F5F9]"
              >
                <CollapseIcon className="size-3.5" />
                შეკუმშვა
              </button>
            </div>

            {/* Full map */}
            <div className="h-[calc(100%-48px)]">{mapContent}</div>
          </div>
        </div>
      )}
    </>
  );
}
