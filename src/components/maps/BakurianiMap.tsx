"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";
import { staticMapUrl } from "@/lib/maps/staticMapUrl";
import Modal from "@/components/shared/Modal";
import { loadMapboxCanvas, loadedMapboxCanvas } from "./loadMapboxCanvas";

/**
 * Wider than a phone the interactive map shows without a tap, so mapbox-gl
 * starts loading with this module, and every dynamic() import of the component
 * waits for it — `.then((mod) => mod.canvasReady.then(() => mod))` — as when
 * both lived in one chunk. Phones get the static preview first.
 */
export const canvasReady: Promise<unknown> =
  typeof window !== "undefined" &&
  !window.matchMedia("(max-width: 767px)").matches
    ? loadMapboxCanvas()
    : Promise.resolve();

const BAKURIANI_CENTER: [number, number] = [41.7509, 43.5294];

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
}: BakurianiMapProps) {
  const t = useTranslations("BakurianiMap");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  // The interactive map's module (mapbox-gl), once loaded; see loadMapboxCanvas.
  // Read the shared cache too: a prefetch may have finished since mount.
  const [loadedCanvas, setLoadedCanvas] = useState(loadedMapboxCanvas);
  const MapboxCanvas = loadedCanvas ?? loadedMapboxCanvas();
  const [isPhone, setIsPhone] = useState<boolean | null>(null);
  const [previewSize, setPreviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);

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

  const wantsCanvas = !mapError && mapReady && (!showPreview || expanded);
  useEffect(() => {
    if (!wantsCanvas || MapboxCanvas) return;
    let active = true;
    loadMapboxCanvas().then(
      (canvas) => {
        if (active) setLoadedCanvas(() => canvas);
      },
      () => {
        if (active) setMapError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [wantsCanvas, MapboxCanvas]);

  // Behind a preview, fetch the interactive map once the page has loaded and
  // gone idle, so a tap rarely waits for it (pointerdown starts it too).
  useEffect(() => {
    if (!showPreview || MapboxCanvas) return;
    let idleId: number | undefined;
    let timerId: number | undefined;
    const prefetch = () => void loadMapboxCanvas().catch(() => {});
    const whenIdle = () => {
      if (window.requestIdleCallback) {
        idleId = window.requestIdleCallback(prefetch, { timeout: 5000 });
      } else {
        timerId = window.setTimeout(prefetch, 1000);
      }
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [showPreview, MapboxCanvas]);

  const mapContent = mapError ? (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC] p-4 text-center text-xs font-medium text-[#64748B]">
      {t("mapUnavailable")}
    </div>
  ) : wantsCanvas && MapboxCanvas ? (
    <MapboxCanvas
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
      onMapError={() => setMapError(true)}
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

  const prefetchCanvas = () => void loadMapboxCanvas().catch(() => {});
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
            onPointerDown={prefetchCanvas}
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
            onPointerDown={prefetchCanvas}
            onClick={openFullMap}
            className={`absolute right-3 z-10 flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-[0px_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#F1F5F9] lg:size-[36px] lg:px-0 lg:text-[0px] ${showPreview ? "top-3" : "bottom-3"}`}
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
