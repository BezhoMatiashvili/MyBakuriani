"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Marker,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import NumberField from "@/components/shared/NumberField";
import { parseNumeric } from "@/lib/utils/number";

const BAKURIANI_CENTER: [number, number] = [41.7509, 43.5294];

// Matches the standard form input styling used across the create wizard.
const inputClass =
  "h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]";

interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
}

// ── CartoDB Positron basemap (no API key, retina-ready) ──
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const PIN_ICON = L.divIcon({
  html: `<div class="bk-picker-pin-inner"><svg width="30" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#2563EB" stroke="#ffffff" stroke-width="2"/></svg></div>`,
  className: "bk-picker-pin",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

interface ExactLocationPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

// ── Map helpers (must live inside MapContainer) ──
function ClickHandler({
  onPick,
}: {
  onPick: (coords: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click: (e) =>
      onPick({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      }),
  });
  return null;
}

function Recenter({ value }: { value: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng]);
  }, [value, map]);
  return null;
}

function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function ExactLocationPicker({
  value,
  onChange,
}: ExactLocationPickerProps) {
  const t = useTranslations("ExactLocationPicker");
  const [latInput, setLatInput] = useState(value ? String(value.lat) : "");
  const [lngInput, setLngInput] = useState(value ? String(value.lng) : "");

  // ── Address search (forward geocoding via /api/geocode) ──
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // "no search yet" vs "0 results"
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight geocode request when the picker unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 3 || searching) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("geocode failed");
      const json = (await res.json()) as { results?: GeocodeResult[] };
      setResults(json.results ?? []);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // superseded by a newer search
      setResults([]);
      toast.error(t("searchError"));
    } finally {
      if (abortRef.current === controller) setSearching(false);
    }
  }, [query, searching, t]);

  const handleSelectResult = useCallback(
    (r: GeocodeResult) => {
      onChange({ lat: r.lat, lng: r.lng });
      setResults([]);
      setSearched(false);
      setQuery(r.display_name);
    },
    [onChange],
  );

  useEffect(() => {
    setLatInput(value ? String(value.lat) : "");
    setLngInput(value ? String(value.lng) : "");
  }, [value]);

  const tryApplyManualCoordinates = useCallback(
    (nextLatInput: string, nextLngInput: string) => {
      // parseNumeric returns null for empty/partial input ("", "-", ".") so an
      // in-progress edit never coerces to 0 and snaps the marker to (0, 0).
      const lat = parseNumeric(nextLatInput);
      const lng = parseNumeric(nextLngInput);
      if (lat === null || lng === null) return;

      const inRange = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      if (!inRange) return;

      onChange({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      });
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-xs font-medium text-[#334155]">
          {t("searchLabel")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder={t("searchPlaceholder")}
            className={inputClass}
            aria-label={t("searchLabel")}
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || query.trim().length < 3}
            aria-label={t("searchButton")}
            className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </button>
        </div>
        {searching && (
          <p className="text-xs text-[#64748B]">{t("searching")}</p>
        )}
        {!searching && searched && results.length === 0 && (
          <p className="text-xs text-[#64748B]">{t("noResults")}</p>
        )}
        {results.length > 0 && (
          <>
            <ul
              role="listbox"
              className="divide-y divide-[#E2E8F0] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
            >
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleSelectResult(r)}
                    className="block w-full px-4 py-2.5 text-left text-sm text-[#334155] outline-none transition-colors hover:bg-[#F1F5F9] focus:bg-[#F1F5F9]"
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[#94A3B8]">{t("attribution")}</p>
          </>
        )}
      </div>
      <div className="h-[240px] overflow-hidden rounded-xl border border-[#E2E8F0]">
        <MapContainer
          center={value ? [value.lat, value.lng] : BAKURIANI_CENTER}
          zoom={value ? 15 : 13}
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
          <ClickHandler onPick={onChange} />
          <Recenter value={value} />
          {value && (
            <Marker position={[value.lat, value.lng]} icon={PIN_ICON} />
          )}
        </MapContainer>
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
