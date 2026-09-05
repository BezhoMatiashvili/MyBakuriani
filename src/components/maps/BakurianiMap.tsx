"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useTranslations } from "next-intl";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { formatNumber } from "@/lib/utils/format";
import Modal from "@/components/shared/Modal";

const BAKURIANI_CENTER: [number, number] = [41.7509, 43.5294];

// ── Mapbox light basemap (closest built-in equivalent to the previous
// CartoDB Positron look). Attribution control is left at its Mapbox
// default (enabled) per Mapbox ToS — never suppress it. ──
const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

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

// ── Price pill classes (the `.bk-pill` base class in globals.css handles
// the divIcon-style center-on-point positioning; only the stateful part
// changes here). ──
function pillBaseClasses(): string {
  return "bk-pill cursor-pointer whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-bold leading-none shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-all duration-150 hover:scale-110";
}
function pillStateClasses(isSelected: boolean, isVip?: boolean): string {
  return isSelected
    ? "scale-110 bg-[#1E293B] text-white shadow-[0px_4px_12px_rgba(0,0,0,0.3)]"
    : isVip
      ? "border-2 border-[#F59E0B] bg-white text-[#1E293B]"
      : "border border-[#E2E8F0] bg-white text-[#1E293B]";
}

// ── Hover preview card (non-interactive; click the pill to navigate).
// Built with the DOM API (not innerHTML) so property.title is never
// interpreted as markup. ──
function buildCardElement(
  property: MapProperty,
  isForSale?: boolean,
): HTMLDivElement {
  const card = document.createElement("div");
  card.className =
    "pointer-events-none absolute left-0 -translate-x-1/2 opacity-0 invisible transition-opacity duration-150";
  card.style.bottom = "22px";

  const inner = document.createElement("div");
  inner.className =
    "w-[180px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0px_8px_24px_rgba(0,0,0,0.15)]";

  if (property.photo) {
    const photo = document.createElement("div");
    photo.className = "h-[80px] w-full bg-cover bg-center";
    photo.style.backgroundImage = `url(${JSON.stringify(property.photo)})`;
    inner.appendChild(photo);
  }

  const body = document.createElement("div");
  body.className = "px-2.5 py-2";

  const title = document.createElement("p");
  title.className =
    "line-clamp-2 text-[11px] font-bold leading-tight text-[#1E293B]";
  title.textContent = property.title;

  const price = document.createElement("p");
  price.className = "mt-0.5 text-[12px] font-black text-[#2563EB]";
  price.textContent = formatPrice(property.price, isForSale);

  body.appendChild(title);
  body.appendChild(price);
  inner.appendChild(body);
  card.appendChild(inner);
  return card;
}

interface MarkerEntry {
  marker: mapboxgl.Marker;
  wrapperEl: HTMLDivElement;
  pillEl: HTMLDivElement;
  cardEl: HTMLDivElement;
  isVip?: boolean;
}

interface MapboxMapViewProps {
  initialCenter: [number, number];
  initialZoom: number;
  hasProperties: boolean;
  properties?: MapProperty[];
  zones: Zone[];
  isForSale?: boolean;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  onPropertyClick?: (id: string) => void;
  onZoneClick?: (zone: string) => void;
  fitBoundsEnabled: boolean;
  boundsKey: string;
  singleZoom: number;
}

// ── Imperative Mapbox GL canvas. Mirrors the previous react-leaflet tree:
// price-pill / zone-pin markers, hover cards, click-to-select, fit-bounds,
// and a mount-time resize() (Mapbox does not auto-detect a container that
// becomes visible/resized after being hidden, e.g. inside a just-opened
// modal). ──
function MapboxMapView({
  initialCenter,
  initialZoom,
  hasProperties,
  properties,
  zones,
  isForSale,
  selectedId,
  setSelectedId,
  onPropertyClick,
  onZoneClick,
  fitBoundsEnabled,
  boundsKey,
  singleZoom,
}: MapboxMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const zoneMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const selectedIdRef = useRef<string | null>(selectedId);
  // Kept fresh every render (not an effect dependency) so the marker-rebuild
  // effect below doesn't need onPropertyClick/onZoneClick in its deps — every
  // call site passes a fresh inline arrow function each render, which would
  // otherwise tear down and rebuild every marker on unrelated re-renders.
  const onPropertyClickRef = useRef(onPropertyClick);
  onPropertyClickRef.current = onPropertyClick;
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;

  // Create the map once per mount; remove it (and every marker) on unmount
  // so navigation / modal close never leaks map instances.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container,
      style: MAPBOX_STYLE,
      center: [initialCenter[1], initialCenter[0]],
      zoom: initialZoom,
    });
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("click", () => setSelectedId(null));
    mapRef.current = map;

    map.resize();
    const resizeTimer = window.setTimeout(() => map.resize(), 200);

    return () => {
      // Markers are removed by the marker-sync effect's own cleanup, which
      // also runs on unmount — map.remove() alone is enough here.
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
    };
    // Intentionally created once per mount — matches the prior MapContainer
    // (react-leaflet also only initializes on mount); later center/zoom
    // moves are handled by the fit-bounds effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild markers whenever the underlying list (or its rendering inputs)
  // changes. Selection highlighting itself is handled by the effect below
  // so a click doesn't tear down and recreate every marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const zoneMarkers = zoneMarkersRef.current;

    markers.forEach(({ marker }) => marker.remove());
    markers.clear();
    zoneMarkers.forEach((marker) => marker.remove());
    zoneMarkersRef.current = [];

    if (hasProperties && properties) {
      properties.forEach((property) => {
        const isVip = property.isSuperVip || property.isVip;
        const isSelected = selectedIdRef.current === property.id;

        const wrapper = document.createElement("div");
        wrapper.className = "bk-price-marker";
        wrapper.style.width = "0px";
        wrapper.style.height = "0px";
        wrapper.style.zIndex = isSelected ? "1000" : "0";

        const pill = document.createElement("div");
        pill.className = `${pillBaseClasses()} ${pillStateClasses(isSelected, isVip)}`;
        pill.style.minHeight = "32px";
        pill.style.minWidth = "48px";
        pill.style.display = "flex";
        pill.style.alignItems = "center";
        pill.style.justifyContent = "center";
        pill.textContent = formatPrice(property.price, isForSale);
        wrapper.appendChild(pill);

        const card = buildCardElement(property, isForSale);
        wrapper.appendChild(card);

        pill.addEventListener("mouseenter", () => {
          if (selectedIdRef.current === property.id) return;
          card.style.opacity = "1";
          card.style.visibility = "visible";
        });
        pill.addEventListener("mouseleave", () => {
          card.style.opacity = "0";
          card.style.visibility = "hidden";
        });
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelectedId((prev) => (prev === property.id ? null : property.id));
          onPropertyClickRef.current?.(property.id);
        });

        const marker = new mapboxgl.Marker({
          element: wrapper,
          anchor: "center",
        })
          .setLngLat([property.lng, property.lat])
          .addTo(map);

        markers.set(property.id, {
          marker,
          wrapperEl: wrapper,
          pillEl: pill,
          cardEl: card,
          isVip,
        });
      });
    } else {
      zones.forEach((zone) => {
        const wrapper = document.createElement("div");
        wrapper.className = "bk-zone-pin";
        wrapper.style.width = "0px";
        wrapper.style.height = "0px";

        const inner = document.createElement("div");
        inner.className = "bk-zone-pin-inner";
        inner.innerHTML =
          '<svg width="30" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#2563EB" stroke="#ffffff" stroke-width="2"/></svg>';
        wrapper.appendChild(inner);

        const label = document.createElement("div");
        label.className =
          "pointer-events-none absolute left-0 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#0000001A] bg-white px-2 py-1 text-[12px] font-medium text-[#1F2937] opacity-0 invisible shadow-[0px_2px_6px_rgba(0,0,0,0.15)] transition-opacity duration-150";
        label.style.bottom = "34px";
        label.textContent = zone.name_ka;
        wrapper.appendChild(label);

        wrapper.addEventListener("mouseenter", () => {
          label.style.opacity = "1";
          label.style.visibility = "visible";
        });
        wrapper.addEventListener("mouseleave", () => {
          label.style.opacity = "0";
          label.style.visibility = "hidden";
        });
        wrapper.addEventListener("click", (e) => {
          e.stopPropagation();
          onZoneClickRef.current?.(zone.name_ka);
        });

        const marker = new mapboxgl.Marker({
          element: wrapper,
          anchor: "center",
        })
          .setLngLat([zone.lng, zone.lat])
          .addTo(map);

        zoneMarkers.push(marker);
      });
    }

    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      zoneMarkers.forEach((marker) => marker.remove());
      zoneMarkersRef.current = [];
    };
  }, [hasProperties, properties, zones, isForSale, setSelectedId]);

  // Sync selection highlighting onto existing marker DOM nodes without
  // rebuilding them.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    markersRef.current.forEach(({ pillEl, wrapperEl, cardEl, isVip }, id) => {
      const isSelected = id === selectedId;
      pillEl.className = `${pillBaseClasses()} ${pillStateClasses(isSelected, isVip)}`;
      wrapperEl.style.zIndex = isSelected ? "1000" : "0";
      if (isSelected) {
        cardEl.style.opacity = "0";
        cardEl.style.visibility = "hidden";
      }
    });
  }, [selectedId]);

  // Fit all property pins into view so none are cut off (skipped when an
  // explicit `center` prop pins the view to a single location).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasProperties || !fitBoundsEnabled) return;
    const points = properties ?? [];
    if (points.length === 0) return;
    if (points.length === 1) {
      map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: singleZoom });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    // boundsKey changes only when the set of coordinates changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, fitBoundsEnabled, hasProperties]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
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
    // Mapbox instance is mounted only after the user opens the full map.
    if (!frame || mapReady || isPhone === null || (isPhone && !expanded))
      return;
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

  // Stable key so the fit-bounds effect only refits when the coordinate set changes.
  const boundsKey = useMemo(
    () => (properties ?? []).map((p) => `${p.lat},${p.lng}`).join("|"),
    [properties],
  );

  const mapContent =
    mapReady && (!isPhone || expanded) ? (
      <MapboxMapView
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        hasProperties={hasProperties}
        properties={properties}
        zones={zones}
        isForSale={isForSale}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        onPropertyClick={onPropertyClick}
        onZoneClick={onZoneClick}
        fitBoundsEnabled={!center}
        boundsKey={boundsKey}
        singleZoom={zoom ?? 14}
      />
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
        // z-0: globals.css's old `.leaflet-container { z-index: 0 }` rule capped
        // Leaflet's stacking context so its controls never overlaid the navbar/
        // modals; Mapbox's `.mapboxgl-map` has no equivalent rule, so the cap is
        // applied directly here instead (same fix as ExactLocationPicker.tsx).
        className={`relative z-0 overflow-hidden ${embedded ? "" : "rounded-[16px] border border-[#E2E8F0]"} ${className ?? ""}`}
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
