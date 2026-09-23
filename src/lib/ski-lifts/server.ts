import "server-only";
import { cache } from "react";
import { timeoutFetch } from "@/lib/with-timeout";
import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
} from "@/lib/status-cards/types";
import {
  parseLiftsFromHtml,
  summarize,
  tbilisiNow,
  type LiftsSummary,
  type ZonePage,
} from "./parse";

export type { LiftsSummary } from "./parse";

// Live Bakuriani ski-lift status for the landing "lifts" status card. Same shape
// as src/lib/road-condition/server.ts: server-side provider fetches behind
// cache() + next:{revalidate}, live data overrides the card's value/subValue/items,
// and ANY failure returns null so the admin-editable default card shows through
// instead of a blank or wrong one. The pure parse/rule logic lives in ./parse.ts
// (unit-tested against archived fixtures); this file only fetches and overlays.
//
// Provider: MTA's own public status site (status.mta.ski) — the same operator data
// the Skipass app shows. There is no JSON API; each per-zone page is a Next.js RSC
// document with the lift rows embedded, so we fetch the page HTML and parse it. The
// fetch is server-side only (Node), so this needs NO CSP connect-src / remotePatterns
// entry — C6 governs browser + next/image hosts only, same as the road badge.
//
// NOTE (2026-09-23): status.mta.ski is currently returning 500 and its backend
// (admin.status.mta.ski) returns Vercel DEPLOYMENT_NOT_FOUND — the site served 200s
// as recently as June 2026, so this is NOT a seasonal idle; the backend deployment
// was deleted (a migration or a retirement — unknown). This module is written and
// unit-tested against archived captures but has NOT been verified against the live
// site. Keep it behind SKI_LIFTS_ENABLED until a live fetch of the three zones is
// confirmed to still parse (the $L marker/chunk format could change on redeploy).
// If the site does not return, MTA/Lemondo API access (option 1) is the fallback.

const LIFTS_CARD_ID = "lifts";

// The three Bakuriani zone slugs on status.mta.ski. Fetched in both locales so the
// card can show MTA's Georgian name (ka page) and English name (en page); Russian
// falls back to English (MTA publishes no Russian).
const ZONES = ["didveli", "kokhta", "mitarbi"] as const;
const LOCALES = ["ka", "en"] as const;

const BASE_URL = "https://status.mta.ski";
// Courtesy: identify the app so the operator can see who's reading. Mirrors the
// User-Agent expectation the road badge documents.
const USER_AGENT =
  "MyBakuriani/1.0 (+https://mybakuriani.ge; lift status card)";

export const LIFTS_REVALIDATE_SECONDS = 5 * 60;
const LIFTS_FETCH_TIMEOUT_MS = 5000;

async function fetchZonePage(
  zone: string,
  locale: string,
): Promise<string | null> {
  try {
    const res = await timeoutFetch(LIFTS_FETCH_TIMEOUT_MS)(
      `${BASE_URL}/${locale}/bakuriani/${zone}`,
      {
        headers: { "user-agent": USER_AGENT },
        next: { revalidate: LIFTS_REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Fetches all Bakuriani zones (ka for status + Georgian names, en for English
// names), matches the two locales by lift id, and applies MTA's own open/closed
// rule at the current Tbilisi time. Returns null if NO zone yielded any lift, so
// the caller falls back to the admin card. cache() dedupes within a render; the
// fetch revalidate window bounds upstream volume (~12 requests / 5 min).
export const getSkiLifts = cache(async (): Promise<LiftsSummary | null> => {
  const pages: ZonePage[] = await Promise.all(
    ZONES.flatMap((zone) =>
      LOCALES.map(async (locale) => ({
        zone,
        locale,
        lifts: parseLiftsFromHtml((await fetchZonePage(zone, locale)) ?? ""),
      })),
    ),
  );
  // The merge/rule is pure and unit-tested in ./parse.ts. It returns null unless
  // every zone yielded lifts, so a partial fetch keeps the admin card rather than
  // showing a wrong "N/M open" total.
  return summarize(pages, ZONES, tbilisiNow());
});

function summaryValue(summary: LiftsSummary): LocalizedText {
  const { openCount, total } = summary;
  return {
    ka: `${openCount}/${total} ღია`,
    en: `${openCount}/${total} open`,
    ru: `${openCount}/${total} открыты`,
  };
}

const OPEN_LABEL: LocalizedText = { ka: "ღია", en: "Open", ru: "Открыт" };
const CLOSED_LABEL: LocalizedText = {
  ka: "დაკეტილი",
  en: "Closed",
  ru: "Закрыт",
};

function buildItems(summary: LiftsSummary): StatusCardItem[] {
  return summary.lifts.map((lift) => ({
    id: `lift-${lift.id}`,
    label: { ka: lift.nameKa, en: lift.nameEn, ru: lift.nameEn },
    value: lift.open ? OPEN_LABEL : CLOSED_LABEL,
    status: lift.open ? "ok" : "closed",
    url: null,
  }));
}

// Truncated preview of the open lifts' names for the collapsed card face, mirroring
// withItemNameSubtitles but built from the LIVE items (which the DB-time subtitle
// helper can't see). Falls back to the closed ones' names if none are open.
function buildSubtitle(summary: LiftsSummary): LocalizedText {
  const pool = summary.lifts.filter((l) => l.open);
  const source = pool.length > 0 ? pool : summary.lifts;
  const pick = (key: "nameKa" | "nameEn") => {
    const names = source.map((l) => l[key]).filter(Boolean);
    const shown = names.slice(0, 2).join(", ");
    return names.length > 2 ? `${shown}…` : shown;
  };
  return { ka: pick("nameKa"), en: pick("nameEn"), ru: pick("nameEn") };
}

// Overrides the lifts card's value/subValue/items with the live MTA data. No-op
// when the fetch failed (null), so the admin-editable default card shows through.
// Deliberately does NOT write redDot: that stays admin-controlled, matching how
// withLiveRoad leaves closure flagging to the admin.
export function withLiveLifts(
  cards: StatusCard[],
  summary: LiftsSummary | null,
): StatusCard[] {
  if (!summary || summary.total === 0) return cards;
  const items = buildItems(summary);
  return cards.map((card) =>
    card.id === LIFTS_CARD_ID
      ? {
          ...card,
          value: summaryValue(summary),
          subValue: buildSubtitle(summary),
          expandable: true,
          items,
        }
      : card,
  );
}
