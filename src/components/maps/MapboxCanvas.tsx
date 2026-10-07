"use client";

// The interactive Mapbox GL map, split out of BakurianiMap so the ~480 KB
// (gzip) mapbox-gl bundle loads only when an interactive map is actually shown
// (see ./loadMapboxCanvas.ts). Phones show a static preview image until tapped.
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { Zone } from "@/lib/zones/types";
import { formatNumber } from "@/lib/utils/format";
import type { MapProperty, RouteDisplay } from "./BakurianiMap";

// ── Mapbox light basemap (closest built-in equivalent to the previous
// CartoDB Positron look). Attribution control is left at its Mapbox
// default (enabled) per Mapbox ToS — never suppress it. ──
const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

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

// ── Pin glyph (lucide MapPin) for a marker with no price. ──
function pinGlyph(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(ns, "path");
  path.setAttribute(
    "d",
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
  );
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", "12");
  dot.setAttribute("cy", "10");
  dot.setAttribute("r", "3");
  svg.append(path, dot);
  return svg;
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

  body.appendChild(title);
  if (property.price != null) {
    const price = document.createElement("p");
    price.className = "mt-0.5 text-[12px] font-black text-[#2563EB]";
    price.textContent = formatPrice(property.price, isForSale);
    body.appendChild(price);
  }
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

export interface MapboxMapViewProps {
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
export default function MapboxMapView({
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
        pill.style.minWidth = property.price != null ? "48px" : "32px";
        pill.style.display = "flex";
        pill.style.alignItems = "center";
        pill.style.justifyContent = "center";
        if (property.price != null) {
          pill.textContent = formatPrice(property.price, isForSale);
        } else {
          pill.appendChild(pinGlyph());
        }
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
