"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useTranslations } from "next-intl";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { formatNumber } from "@/lib/utils/format";
import Modal from "@/components/shared/Modal";

const BAKURIANI_CENTER: [number, number] = [41.7509, 43.5294];

// ── CartoDB Positron basemap (no API key, retina-ready) ──
// Light minimal style that mirrors the previous Google "Airbnb" theme.
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
  /** Admin-managed zone list. Falls back to the 4 seeded zones if omitted. */
  zones?: Zone[];
}

// ── Price formatting ──
function formatPrice(price: number, isForSale?: boolean): string {
  if (isForSale && price >= 1000) {
    return `${formatNumber(price)} ₾`;
  }
  return `${price} ₾`;
}

// ── Price pill marker (HTML divIcon — Tailwind classes resolve globally) ──
function buildPillIcon(
  property: MapProperty,
  isSelected: boolean,
  isForSale?: boolean,
): L.DivIcon {
  const isVip = property.isSuperVip || property.isVip;
  const stateClasses = isSelected
    ? "scale-110 bg-[#1E293B] text-white shadow-[0px_4px_12px_rgba(0,0,0,0.3)]"
    : isVip
      ? "border-2 border-[#F59E0B] bg-white text-[#1E293B]"
      : "border border-[#E2E8F0] bg-white text-[#1E293B]";

  const html = `<div class="bk-pill cursor-pointer whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-bold leading-none shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-all duration-150 hover:scale-110 ${stateClasses}" style="min-height:32px;min-width:48px;display:flex;align-items:center;justify-content:center;">${formatPrice(property.price, isForSale)}</div>`;

  return L.divIcon({
    html,
    className: "bk-price-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// ── Zone teardrop pin (matches previous blue/white SVG marker) ──
const ZONE_ICON = L.divIcon({
  html: `<div class="bk-zone-pin-inner"><svg width="30" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#2563EB" stroke="#ffffff" stroke-width="2"/></svg></div>`,
  className: "bk-zone-pin",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// ── Price marker with hover card (Tooltip renders real React children) ──
function PriceMarker({
  property,
  isSelected,
  isForSale,
  onSelect,
}: {
  property: MapProperty;
  isSelected: boolean;
  isForSale?: boolean;
  onSelect: () => void;
}) {
  const icon = useMemo(
    () => buildPillIcon(property, isSelected, isForSale),
    [property, isSelected, isForSale],
  );

  return (
    <Marker
      position={[property.lat, property.lng]}
      icon={icon}
      zIndexOffset={isSelected ? 1000 : 0}
      eventHandlers={{ click: onSelect }}
    >
      {/* Hover preview card (non-interactive; click the pill to navigate).
          Leaflet closes a marker tooltip on mouse-out, so an offset card can't
          be reliably clicked — the pill click handles navigation instead. */}
      {!isSelected && (
        <Tooltip
          direction="top"
          offset={[0, -22]}
          opacity={1}
          className="bk-card-tooltip"
        >
          <div className="w-[180px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_8px_24px_rgba(0,0,0,0.15)]">
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
        </Tooltip>
      )}
    </Marker>
  );
}

// ── Map helpers (must live inside MapContainer) ──
function MapClickClear({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: () => onClear() });
  return null;
}

// Leaflet renders grey if its container is sized after init (modals/expand).
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

// Fit all property pins into view so none are cut off.
function FitBounds({
  points,
  boundsKey,
  singleZoom,
}: {
  points: MapProperty[];
  boundsKey: string;
  /** Zoom used when there's exactly one point (keeps prior single-pin parity). */
  singleZoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], singleZoom);
      return;
    }
    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    // boundsKey changes only when the set of coordinates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, map]);
  return null;
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
  zones = FALLBACK_ZONES,
}: BakurianiMapProps) {
  const t = useTranslations("BakurianiMap");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const frame = mapFrameRef.current;
    // On phones the visible map is deliberately a lightweight preview. The
    // Leaflet instance is mounted only after the user opens the full map.
    if (!frame || mapReady || isPhone === null || (isPhone && !expanded)) return;
    if (!window.IntersectionObserver) {
      setMapReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setMapReady(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mapReady, isPhone, expanded]);

  const hasProperties = !!properties && properties.length > 0;

  // Initial center: explicit center → average of properties → Bakuriani.
  const initialCenter: [number, number] = center
    ? [center.lat, center.lng]
    : hasProperties
      ? [
          properties!.reduce((sum, p) => sum + p.lat, 0) / properties!.length,
          properties!.reduce((sum, p) => sum + p.lng, 0) / properties!.length,
        ]
      : BAKURIANI_CENTER;

  const initialZoom = zoom ?? (hasProperties ? 14 : 13);

  // Stable key so FitBounds only refits when the coordinate set changes.
  const boundsKey = useMemo(
    () => (properties ?? []).map((p) => `${p.lat},${p.lng}`).join("|"),
    [properties],
  );

  const mapContent = mapReady && (!isPhone || expanded) ? (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      zoomControl={false}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        subdomains="abcd"
        detectRetina
        maxZoom={20}
      />
      <ZoomControl position="topright" />
      <InvalidateOnMount />
      <MapClickClear onClear={() => setSelectedId(null)} />

      {hasProperties ? (
        <>
          {!center && (
            <FitBounds
              points={properties!}
              boundsKey={boundsKey}
              singleZoom={zoom ?? 14}
            />
          )}
          {properties!.map((p) => (
            <PriceMarker
              key={p.id}
              property={p}
              isSelected={selectedId === p.id}
              isForSale={isForSale}
              onSelect={() => {
                setSelectedId((prev) => (prev === p.id ? null : p.id));
                onPropertyClick?.(p.id);
              }}
            />
          ))}
        </>
      ) : (
        zones.map((zone) => (
          <Marker
            key={zone.id}
            position={[zone.lat, zone.lng]}
            icon={ZONE_ICON}
            eventHandlers={{ click: () => onZoneClick?.(zone.name_ka) }}
          >
            <Tooltip direction="top" offset={[0, -34]}>
              {zone.name_ka}
            </Tooltip>
          </Marker>
        ))
      )}
    </MapContainer>
  ) : (
    <div
      className="flex h-full w-full items-center justify-center bg-[#F1F5F9]"
      aria-busy="true"
      aria-label={t("mapTitle")}
    >
      <span className="sr-only">{t("mapTitle")}</span>
    </div>
  );

  return (
    <>
      <div
        ref={mapFrameRef}
        className={`relative overflow-hidden ${embedded ? "" : "rounded-[16px] border border-[#E2E8F0]"} ${className ?? ""}`}
      >
        {expanded ? (
          <div className="h-full w-full bg-[#F1F5F9]" aria-hidden="true" />
        ) : isPhone ? (
          <div
            className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#DBEAFE,transparent_45%),linear-gradient(135deg,#F8FAFC,#E2E8F0)]"
            aria-hidden="true"
          >
            <div className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-[13px] font-bold text-[#334155] shadow-sm">
              {t("mapTitle")}
            </div>
          </div>
        ) : (
          mapContent
        )}

        {/* Phone previews always expose a full-size interactive map. */}
        {(expandable || isPhone) && (
          <button
            type="button"
            onClick={() => {
              setMapReady(true);
              setExpanded(true);
            }}
            className="absolute bottom-3 right-3 z-10 flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9] lg:size-[36px] lg:px-0 lg:text-[0px]"
            aria-label={t("expandMap")}
          >
            <ExpandIcon className="size-4 text-[#334155]" />
            <span className="lg:hidden">{t("expandMap")}</span>
          </button>
        )}
      </div>

      {/* Expanded modal overlay */}
      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        title={t("mapTitle")}
        size="xl"
        bodyClassName="h-[min(70dvh,760px)] max-h-none p-0"
      >
        {mapContent}
      </Modal>
    </>
  );
}
