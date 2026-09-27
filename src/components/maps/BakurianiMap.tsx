"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useTranslations } from "next-intl";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { formatNumber } from "@/lib/utils/format";
import { staticMapUrl } from "@/lib/maps/staticMapUrl";
import {
  fetchDrivingRoute,
  type LatLng,
  type RouteLineString,
} from "@/lib/maps/directions";
import { googleMapsDirectionsUrl } from "@/lib/maps/googleMapsUrl";
import { requestUserLocation } from "@/lib/geolocation/useUserLocation";
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

/** A resolved route to draw: the visitor's origin, the destination, and the
 * geometry between them. */
export interface RouteDisplay {
  origin: LatLng;
  destination: LatLng;
  geojson: RouteLineString;
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
  /**
   * Keep the lightweight preview at every width, mounting the real canvas only
   * once the map is expanded. For callers that place this inside a scrollable
   * container: mapbox-gl's own stylesheet puts `touch-action: none` on an
   * interactive canvas, so a finger landing on the map cannot scroll its
   * container. The built-in `isPhone` preview stops at 767px, which is not far
   * enough when the container is a bottom sheet that runs to 1023px.
   */
  previewUntilExpanded?: boolean;
  /** Admin-managed zone list. Falls back to the 4 seeded zones if omitted. */
  zones?: Zone[];
  /**
   * Adds a "show me the route" control that, on click, asks for the
   * visitor's location and draws the driving route from there to `center`.
   * Only meaningful when `center` names a single known destination (a
   * listing detail page) - not the multi-pin listing/zone maps.
   */
  showRouteButton?: boolean;
  /**
   * A pre-fetched route to draw instead of `showRouteButton`'s own internal
   * fetch - e.g. the landing road card's visitor-or-Tbilisi -> Bakuriani
   * route (RoadRouteMap.tsx), which already knows both endpoints and only
   * needs this component to render the line.
   */
  route?: RouteDisplay | null;
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
  onMapError?: () => void;
  route?: RouteDisplay | null;
}

const ROUTE_SOURCE_ID = "mb-route";
const ROUTE_LAYER_ID = "mb-route-line";

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
  onMapError,
  route,
}: MapboxMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const zoneMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeMarkerRef = useRef<mapboxgl.Marker | null>(null);
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

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
    if (!token) {
      // Mapbox GL throws synchronously from `new Map()` with no token, which
      // would crash the whole page via the nearest error boundary since this
      // runs inside an effect. Bail out, but tell the parent so it can show a
      // visible fallback instead of leaving the container blank.
      onMapError?.();
      return;
    }
    mapboxgl.accessToken = token;

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
    map.on("error", () => onMapError?.());
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

  // Draws (or clears) the "show me the route" line + a marker at its origin,
  // and fits both endpoints into view. Declared after the map-creation effect
  // above so mapRef.current is already set by the time this runs on mount.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyRoute = () => {
      // The map-creation effect's cleanup (declared above this one) may have
      // already called map.remove() and cleared mapRef by the time a queued
      // "load" callback fires, or by the time this effect re-runs for a new
      // `route` after that - touching a removed map's style throws inside
      // Mapbox GL internals.
      if (!mapRef.current) return;
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      routeMarkerRef.current?.remove();
      routeMarkerRef.current = null;

      if (!route) return;

      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: route.geojson },
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#2563EB", "line-width": 4 },
      });

      const originEl = document.createElement("div");
      originEl.className =
        "size-4 rounded-full border-2 border-white bg-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.35)]";
      routeMarkerRef.current = new mapboxgl.Marker({
        element: originEl,
        anchor: "center",
      })
        .setLngLat([route.origin.lng, route.origin.lat])
        .addTo(map);

      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([route.origin.lng, route.origin.lat]);
      bounds.extend([route.destination.lng, route.destination.lat]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    };

    if (map.isStyleLoaded()) {
      applyRoute();
    } else {
      map.once("load", applyRoute);
    }

    return () => {
      map.off("load", applyRoute);
      // Same reasoning as inside applyRoute: on unmount, the map-creation
      // effect's own cleanup may run first and already remove the map.
      if (!mapRef.current) return;
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      routeMarkerRef.current?.remove();
      routeMarkerRef.current = null;
    };
  }, [route]);

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
  previewUntilExpanded,
  zones = FALLBACK_ZONES,
  showRouteButton,
  route: routeProp,
}: BakurianiMapProps) {
  const t = useTranslations("BakurianiMap");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const [previewSize, setPreviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const [internalRoute, setInternalRoute] = useState<RouteDisplay | null>(null);
  const [routeStatus, setRouteStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const mapFrameRef = useRef<HTMLDivElement>(null);

  const route = routeProp ?? internalRoute;

  // Falls back to the sole property's own coordinates when the caller passed
  // `properties` but no explicit `center` (e.g. the sale detail page) - both
  // name the same single, exact destination a "show me the route" button
  // needs.
  const singleDestination: LatLng | undefined =
    center ??
    (properties && properties.length === 1
      ? { lat: properties[0].lat, lng: properties[0].lng }
      : undefined);

  const handleShowRoute = async () => {
    if (!singleDestination) return;
    setMapReady(true);
    setExpanded(true);
    setRouteStatus("loading");
    const coords = await requestUserLocation();
    if (!coords) {
      setRouteStatus("error");
      return;
    }
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
    const result = await fetchDrivingRoute(coords, singleDestination, token);
    if (!result) {
      setRouteStatus("error");
      return;
    }
    setInternalRoute({
      origin: coords,
      destination: singleDestination,
      geojson: result.geojson,
    });
    setRouteStatus("idle");
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // One definition of "show the preview instead of a live canvas". `isPhone` is
  // this component's own perf rule; `previewUntilExpanded` extends it to every
  // width for callers that need it. Still null-guarded: `isPhone === null` is
  // the pre-matchMedia first frame.
  const showPreview = previewUntilExpanded || isPhone === true;

  useEffect(() => {
    const frame = mapFrameRef.current;
    // On phones the visible map is deliberately a lightweight preview. The
    // Mapbox instance is mounted only after the user opens the full map.
    if (!frame || mapReady || isPhone === null || (showPreview && !expanded))
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
  }, [mapReady, isPhone, expanded, showPreview]);

  // The static preview image is requested at the frame's exact size, so its
  // built-in Mapbox attribution is never cropped by object-cover.
  useEffect(() => {
    const frame = mapFrameRef.current;
    if (!frame || !showPreview) return;
    const measure = () => {
      const width = Math.round(frame.clientWidth);
      const height = Math.round(frame.clientHeight);
      if (width < 1 || height < 1) return;
      setPreviewSize((prev) =>
        prev?.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };
    measure();
    if (!window.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [showPreview]);

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

  // Same pins and framing the interactive map opens with: price pins (or zone
  // pins when there are none), fit-to-pins for 2+ properties, otherwise the
  // explicit center/zoom.
  const previewUrl =
    showPreview && previewSize
      ? staticMapUrl({
          token: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "",
          ...previewSize,
          pins: hasProperties
            ? properties!.map((p) => ({
                lat: p.lat,
                lng: p.lng,
                highlight: p.isSuperVip || p.isVip,
              }))
            : zones.map((zone) => ({ lat: zone.lat, lng: zone.lng })),
          view:
            center || !hasProperties || properties!.length === 1
              ? {
                  lat: initialCenter[0],
                  lng: initialCenter[1],
                  zoom: initialZoom,
                }
              : undefined,
        })
      : null;

  const mapContent = mapError ? (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC] p-4 text-center text-xs font-medium text-[#64748B]">
      {t("mapUnavailable")}
    </div>
  ) : mapReady && (!showPreview || expanded) ? (
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
      fitBoundsEnabled={!center && !route}
      boundsKey={boundsKey}
      singleZoom={zoom ?? 14}
      onMapError={() => setMapError(true)}
      route={route}
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

  const openFullMap = () => {
    setMapReady(true);
    setExpanded(true);
  };

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
        ) : showPreview ? (
          // Tapping anywhere on the preview opens the full map. The labelled
          // button below is the accessible control, so this one stays out of
          // the tab order and the accessibility tree.
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={openFullMap}
            className="relative flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#DBEAFE,transparent_45%),linear-gradient(135deg,#F8FAFC,#E2E8F0)]"
          >
            {/* Placeholder until the static map loads, and if it can't. */}
            <span className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-[13px] font-bold text-[#334155] shadow-sm">
              {t("mapTitle")}
            </span>
            {previewUrl && previewUrl !== failedPreviewUrl && (
              // Plain <img>, loaded straight from Mapbox: the browser's Referer
              // is what satisfies the token's URL restrictions, and it keeps
              // the token out of the /_next/image cache.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setFailedPreviewUrl(previewUrl)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </button>
        ) : (
          mapContent
        )}

        {/* Phone previews always expose a full-size interactive map. On the
            preview it sits top-right: the static image carries the Mapbox
            attribution bottom-right, which must stay visible. */}
        {(expandable || isPhone) && (
          <button
            type="button"
            onClick={openFullMap}
            className={`absolute right-3 z-10 flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9] lg:size-[36px] lg:px-0 lg:text-[0px] ${showPreview ? "top-3" : "bottom-3"}`}
            aria-label={t("expandMap")}
          >
            <ExpandIcon className="size-4 text-[#334155]" />
            <span className="lg:hidden">{t("expandMap")}</span>
          </button>
        )}

        {/* "Show me the route": always on the opposite side from the expand
            button above (which is right-anchored), so the two never collide. */}
        {showRouteButton && singleDestination && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
            {internalRoute ? (
              <a
                href={googleMapsDirectionsUrl(
                  internalRoute.destination,
                  internalRoute.origin,
                )}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9]"
              >
                {t("openInGoogleMaps")}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void handleShowRoute()}
                disabled={routeStatus === "loading"}
                className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60"
              >
                {routeStatus === "loading" ? t("locatingYou") : t("showRoute")}
              </button>
            )}
            {routeStatus === "error" && (
              <>
                <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-[#64748B] shadow-sm">
                  {t("routeUnavailable")}
                </span>
                <a
                  href={googleMapsDirectionsUrl(singleDestination)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#334155] shadow-sm transition-colors hover:bg-[#F1F5F9]"
                >
                  {t("openInGoogleMaps")}
                </a>
              </>
            )}
          </div>
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
