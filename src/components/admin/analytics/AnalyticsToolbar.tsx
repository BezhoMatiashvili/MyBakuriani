"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, X } from "lucide-react";
import DateField from "@/components/shared/DateField";
import {
  DEVICES,
  EMPTY_DIMENSIONS,
  MAX_RANGE_DAYS,
  PAGE_TYPES,
  PERIOD_PRESETS,
  TRAFFIC_SOURCES,
  hasDimensionFilter,
  isIsoDate,
  isOneOf,
  presetRange,
  previousRange,
  rangeDays,
  tbilisiToday,
  type AnalyticsQuery,
  type DimensionKey,
  type Dimensions,
  type PeriodPreset,
} from "@/lib/analytics/model";
import {
  activeFilters,
  dimensionValueLabel,
  type TrafficData,
} from "@/lib/analytics/report";
import ExportMenu from "./ExportMenu";
import { useAnalyticsLabels } from "./BlockCard";

const SELECT =
  "h-11 min-h-[44px] w-full min-w-0 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-[#1E293B] outline-none focus:border-[#2563EB] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]";
const CAPTION = "text-[12px] font-bold text-[#94A3B8]";
const FIELD_LABEL = "text-[12px] font-semibold text-[#64748B]";

/**
 * Spec §1 (period, custom date, compare) and §8 (device, country/city,
 * traffic source, page type). The active choices read as the spec's chain,
 * "ბოლო 30 დღე → Mobile → თბილისი → Google → Export", ending in the
 * whole-page export.
 */
export default function AnalyticsToolbar({
  query,
  onChange,
  options,
  dimensionsSince,
}: {
  query: AnalyticsQuery;
  onChange: (next: AnalyticsQuery) => void;
  options: TrafficData["options"] | null;
  dimensionsSince: string | null;
}) {
  const t = useTranslations("AdminAnalytics");
  const labels = useAnalyticsLabels();
  const today = tbilisiToday();
  const [customOpen, setCustomOpen] = useState(query.period === "custom");
  const [from, setFrom] = useState(query.range.from);
  const [to, setTo] = useState(query.range.to);
  const [invalid, setInvalid] = useState(false);

  const setDims = (patch: Partial<Dimensions>) =>
    onChange({ ...query, dims: { ...query.dims, ...patch } });

  const pickPreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setFrom(query.range.from);
      setTo(query.range.to);
      setInvalid(false);
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    const range = presetRange(preset, today);
    if (range) onChange({ ...query, period: preset, range });
  };

  const applyCustom = () => {
    const ok =
      isIsoDate(from) &&
      isIsoDate(to) &&
      from <= to &&
      to <= today &&
      rangeDays({ from, to }) <= MAX_RANGE_DAYS;
    setInvalid(!ok);
    if (ok) onChange({ ...query, period: "custom", range: { from, to } });
  };

  const countries = Array.from(
    new Set([
      ...(options?.countries ?? []),
      ...(query.dims.country ? [query.dims.country] : []),
    ]),
  ).sort((a, b) => labels.country(a).localeCompare(labels.country(b)));
  // The spec's chain picks the city straight away ("Mobile → თბილისი →
  // Google"). The query keeps a city only inside its country, so a city chosen
  // without one brings its country along (the GeoIP table names cities inside
  // Georgia only), and the chain shows the city alone.
  const cityCountry = new Map(
    (options?.cities ?? []).map((c) => [c.city, c.country] as const),
  );
  const cities = Array.from(
    new Set([
      ...(options?.cities ?? [])
        .filter((c) => !query.dims.country || c.country === query.dims.country)
        .map((c) => c.city),
      ...(query.dims.city ? [query.dims.city] : []),
    ]),
  ).sort((a, b) => labels.city(a).localeCompare(labels.city(b)));

  const chain = activeFilters(query.dims).filter(
    (f) => !(f.key === "country" && query.dims.city),
  );
  const removeFilter = (key: DimensionKey) =>
    setDims(
      key === "country" ? { country: null, city: null } : { [key]: null },
    );

  return (
    <div
      data-testid="analytics-toolbar"
      className="space-y-4 rounded-3xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
    >
      {/* §1 period */}
      <div className="space-y-3">
        <p className={CAPTION}>{t("period.label")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_PRESETS.map((preset) => {
            const active =
              preset === "custom"
                ? customOpen || query.period === "custom"
                : !customOpen && query.period === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                data-testid={`analytics-period-${preset}`}
                onClick={() => pickPreset(preset)}
                className={`min-h-11 rounded-xl px-4 text-[12px] font-bold transition-colors ${
                  active
                    ? "bg-[#0F172A] text-white"
                    : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9]"
                }`}
              >
                {t(`period.${preset}`)}
              </button>
            );
          })}
        </div>

        {customOpen ? (
          <div className="flex flex-wrap items-end gap-2">
            <DateField
              id="analytics-from"
              value={from}
              onChange={setFrom}
              max={to || today}
              placeholder={t("period.from")}
              className="w-[160px]"
            />
            <span className="pb-3 text-[#94A3B8]">—</span>
            <DateField
              id="analytics-to"
              value={to}
              onChange={setTo}
              min={from || undefined}
              max={today}
              placeholder={t("period.to")}
              className="w-[160px]"
            />
            <button
              type="button"
              data-testid="analytics-period-apply"
              onClick={applyCustom}
              className="min-h-11 rounded-xl bg-[#2563EB] px-4 text-[12px] font-bold text-white hover:bg-[#1D4ED8]"
            >
              {t("period.apply")}
            </button>
            {invalid ? (
              <p
                role="alert"
                className="w-full text-[12px] font-semibold text-[#DC2626]"
              >
                {t("period.invalid")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#1E293B]">
            <input
              type="checkbox"
              data-testid="analytics-compare"
              checked={query.compare}
              onChange={(e) =>
                onChange({ ...query, compare: e.target.checked })
              }
              className="h-5 w-5 rounded border-[#CBD5E1] accent-[#2563EB]"
            />
            {t("period.compare")}
          </label>
          <span
            data-testid="analytics-range"
            className="text-[12px] font-medium text-[#64748B]"
          >
            {t("period.range", query.range)}
            {query.compare
              ? ` · ${t("period.compareRange", previousRange(query.range))}`
              : ""}
          </span>
        </div>
      </div>

      {/* §8 filters */}
      <div className="space-y-2 border-t border-[#F1F5F9] pt-4">
        <p className={CAPTION}>{t("filters.title")}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <label className="flex min-w-0 flex-col gap-1">
            <span className={FIELD_LABEL}>{t("filters.device")}</span>
            <select
              data-testid="analytics-filter-device"
              value={query.dims.device ?? ""}
              onChange={(e) =>
                setDims({
                  device: isOneOf(DEVICES, e.target.value)
                    ? e.target.value
                    : null,
                })
              }
              className={SELECT}
            >
              <option value="">{t("filters.all")}</option>
              {DEVICES.map((d) => (
                <option key={d} value={d}>
                  {t(`devices.${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={FIELD_LABEL}>{t("filters.country")}</span>
            <select
              data-testid="analytics-filter-country"
              value={query.dims.country ?? ""}
              onChange={(e) =>
                setDims({ country: e.target.value || null, city: null })
              }
              className={SELECT}
            >
              <option value="">{t("filters.all")}</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {labels.country(code)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={FIELD_LABEL}>{t("filters.city")}</span>
            <select
              data-testid="analytics-filter-city"
              value={query.dims.city ?? ""}
              onChange={(e) => {
                const city = e.target.value || null;
                setDims(
                  city && !query.dims.country
                    ? { city, country: cityCountry.get(city) ?? null }
                    : { city },
                );
              }}
              className={SELECT}
            >
              <option value="">{t("filters.all")}</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {labels.city(city)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={FIELD_LABEL}>{t("filters.source")}</span>
            <select
              data-testid="analytics-filter-source"
              value={query.dims.source ?? ""}
              onChange={(e) =>
                setDims({
                  source: isOneOf(TRAFFIC_SOURCES, e.target.value)
                    ? e.target.value
                    : null,
                })
              }
              className={SELECT}
            >
              <option value="">{t("filters.all")}</option>
              {TRAFFIC_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`sources.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
            <span className={FIELD_LABEL}>{t("filters.page")}</span>
            <select
              data-testid="analytics-filter-page"
              value={query.dims.page ?? ""}
              onChange={(e) =>
                setDims({
                  page: isOneOf(PAGE_TYPES, e.target.value)
                    ? e.target.value
                    : null,
                })
              }
              className={SELECT}
            >
              <option value="">{t("filters.all")}</option>
              {PAGE_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`pageTypes.${p}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasDimensionFilter(query.dims) && dimensionsSince ? (
          <p className="text-[11px] font-medium text-[#94A3B8]">
            {t("filters.since", { date: dimensionsSince })}
          </p>
        ) : null}
      </div>

      {/* The chain: period → filters → Export (the spec's §11 example). */}
      <div
        data-testid="analytics-chain"
        className="flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-4"
        aria-label={t("filters.chain")}
      >
        <span className="inline-flex min-h-9 items-center rounded-full bg-[#EFF6FF] px-3 text-[12px] font-bold text-[#1D4ED8]">
          {query.period === "custom"
            ? t("period.range", query.range)
            : t(`period.${query.period}`)}
        </span>
        {chain.map((f) => {
          const value = dimensionValueLabel(f.key, f.value, labels);
          return (
            <span key={f.key} className="inline-flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-[#94A3B8]" aria-hidden />
              <span
                data-testid={`analytics-chip-${f.key}`}
                className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[#F1F5F9] pl-3 text-[12px] font-bold text-[#1E293B]"
              >
                {value}
                <button
                  type="button"
                  onClick={() => removeFilter(f.key)}
                  aria-label={t("filters.remove", {
                    name: `${t(`filters.${f.key}`)}: ${value}`,
                  })}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#64748B] hover:bg-[#E2E8F0]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            </span>
          );
        })}
        <ArrowRight className="h-4 w-4 text-[#94A3B8]" aria-hidden />
        <ExportMenu
          block="all"
          query={query}
          label={t("export.pageButton")}
          primary
        />
        {chain.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...query, dims: EMPTY_DIMENSIONS })}
            className="min-h-11 rounded-xl px-3 text-[12px] font-bold text-[#64748B] hover:bg-[#F1F5F9]"
          >
            {t("filters.clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
