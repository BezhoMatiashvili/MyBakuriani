// Pure, dependency-free parser + open/closed logic for the Bakuriani ski-lift
// status card. Kept ALIAS-FREE (no `@/` runtime imports) on purpose so it runs
// under scripts/unit (node --test with type stripping) against the archived
// status.mta.ski fixtures — see scripts/unit/ski-lifts-parse.test.mjs and
// src/lib/ski-lifts/server.ts (the fetch/overlay half that DOES use `@/`).
//
// Source of truth: MTA's public per-zone pages, e.g. status.mta.ski/en/bakuriani/
// didveli. Each page is a Next.js RSC document; the lift rows are embedded in
// `self.__next_f.push([1,"…"])` flight chunks as escaped JSON objects, each
// preceded by its DB id in a `"$L<n>","<id>",{…}` component marker. We match a
// lift's English name (from the /en/ page) to its Georgian name (from the /ka/
// page) by that id. The `<n>` in `$L<n>` is a per-build reference number and WILL
// change between deployments, so we match any `$L<token>` — the anchor is the
// object shape, not the number.
//
// The open/closed rule is copied EXACTLY from MTA's own on/off indicator
// component (Luxon `Interval.contains`, which is [start, end)): a lift shows "on"
// iff status === 2 AND now is inside [openDate, closeDate) AND the current
// time-of-day is inside [openTime, closeTime). status 1 is operator-set "not
// running"; the lift is OFF on the closeDate itself (half-open at the top), and a
// reversed/degenerate interval is closed. Everything is evaluated in Asia/Tbilisi
// (Georgia is a fixed UTC+4, no DST), NOT the server's timezone — the host is in
// Singapore.

export type RawLift = {
  id: string;
  type: string;
  name: string;
  status: number;
  openTime: string; // "HH:MM:SS"
  closeTime: string; // "HH:MM:SS"
  openDate: string; // "YYYY-MM-DD"
  closeDate: string; // "YYYY-MM-DD"
};

// One zone page's parsed lifts, tagged with the zone slug and locale it came from.
export type ZonePage = {
  zone: string;
  locale: "ka" | "en";
  lifts: RawLift[];
};

export type LiftStatus = {
  id: string;
  nameKa: string;
  nameEn: string;
  open: boolean;
};

export type LiftsSummary = {
  lifts: LiftStatus[];
  openCount: number;
  total: number;
};

// A point in Tbilisi local time, reduced to the two comparisons the rule needs:
// a YYYYMMDD integer (for the season-date window) and minutes-since-midnight
// (for the working-hours window).
export type TbilisiNow = {
  ymd: number; // e.g. 2026-02-25 -> 20260225
  minute: number; // 0..1439
};

const CHUNK_RE = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

// Joins the string bodies of every flight chunk BEFORE unescaping, so a lift
// object split across two `self.__next_f.push([1,"…"])` calls (Next splits the
// stream at arbitrary byte offsets) is reassembled instead of silently dropped.
// The `\/` -> `/` and `\"` -> `"` unescaping is applied once, to the joined text.
// We deliberately do NOT run a full unicode unescape — the payload is valid UTF-8
// and the lift objects carry no other escape sequences on the fields we read.
function joinFlightChunks(html: string): string {
  const bodies: string[] = [];
  for (const m of html.matchAll(CHUNK_RE)) bodies.push(m[1]);
  const joined = bodies.length > 0 ? bodies.join("") : html;
  return joined.replace(/\\"/g, '"').replace(/\\\//g, "/");
}

const LIFT_RE =
  /"\$L[0-9a-z]+","(\d+)",(\{"type":"[^"]*","liftsHoursColumn":.*?"closeDate":"[^"]*"\})/g;

// Parses every lift row out of one zone page's HTML. Returns [] on anything
// unexpected (shape change, empty page) rather than throwing, so the caller can
// treat "no lifts" and "fetch failed" identically and fall back to the admin card.
export function parseLiftsFromHtml(html: string): RawLift[] {
  const text = joinFlightChunks(html);
  const lifts: RawLift[] = [];
  for (const match of text.matchAll(LIFT_RE)) {
    const id = match[1];
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(match[2]) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof obj.name === "string" ? obj.name : "";
    const status = typeof obj.status === "number" ? obj.status : NaN;
    if (!name || Number.isNaN(status)) continue;
    lifts.push({
      id,
      type: typeof obj.type === "string" ? obj.type : "",
      name,
      status,
      openTime: typeof obj.openTime === "string" ? obj.openTime : "",
      closeTime: typeof obj.closeTime === "string" ? obj.closeTime : "",
      openDate: typeof obj.openDate === "string" ? obj.openDate : "",
      closeDate: typeof obj.closeDate === "string" ? obj.closeDate : "",
    });
  }
  return lifts;
}

// "YYYY-MM-DD" -> 20260225, or null if malformed.
function dateToYmd(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

// "HH:MM:SS" (or "HH:MM") -> minutes since midnight, or null if malformed.
function timeToMinute(time: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Current wall-clock in Asia/Tbilisi via Intl, so a change in Georgia's offset
// would be picked up automatically and the server's own timezone never leaks in.
export function tbilisiNow(now: Date = new Date()): TbilisiNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const ymd =
    Number(get("year")) * 10000 +
    Number(get("month")) * 100 +
    Number(get("day"));
  // Intl can emit "24" for midnight in some engines; normalise to 0.
  const hour = Number(get("hour")) % 24;
  const minute = hour * 60 + Number(get("minute"));
  return { ymd, minute };
}

// Exact replica of MTA's on/off rule. The season window is half-open [open,
// close): a lift is OFF on the closeDate itself (Luxon Interval.contains uses
// start <= dt < end, and closeDate is midnight at the START of that day). Any
// malformed/reversed interval -> closed.
export function isLiftOpen(lift: RawLift, now: TbilisiNow): boolean {
  if (lift.status !== 2) return false;
  const openYmd = dateToYmd(lift.openDate);
  const closeYmd = dateToYmd(lift.closeDate);
  if (openYmd === null || closeYmd === null) return false;
  if (now.ymd < openYmd || now.ymd >= closeYmd) return false; // out of season / reversed
  const openMin = timeToMinute(lift.openTime);
  const closeMin = timeToMinute(lift.closeTime);
  if (openMin === null || closeMin === null) return false;
  // Half-open [open, close), matching Luxon Interval.contains in MTA's code.
  return now.minute >= openMin && now.minute < closeMin;
}

// Merges the per-zone, per-locale pages into one summary and applies the rule.
// Pure so it can be unit-tested (the failure modes below are exactly where a
// partial fetch would otherwise produce a confidently-wrong total):
//   - ka pages give Georgian names + status/dates; en pages give English names.
//     A lift missing from one locale falls back to the other by id.
//   - Requires EVERY expected zone to yield at least one lift, else returns null
//     (a dropped zone would silently shrink the "N/M open" total). null -> the
//     caller keeps the admin-editable card.
export function summarize(
  pages: ZonePage[],
  expectedZones: readonly string[],
  now: TbilisiNow,
): LiftsSummary | null {
  const all: LiftStatus[] = [];
  const seen = new Set<string>();

  for (const zone of expectedZones) {
    const ka = pages.find((p) => p.zone === zone && p.locale === "ka");
    const en = pages.find((p) => p.zone === zone && p.locale === "en");
    const kaById = new Map((ka?.lifts ?? []).map((l) => [l.id, l]));
    const enById = new Map((en?.lifts ?? []).map((l) => [l.id, l]));

    // Prefer ka rows (Georgian names) for the primary list; fall back to en.
    const primary = (ka?.lifts?.length ? ka.lifts : en?.lifts) ?? [];
    if (primary.length === 0) return null; // zone missing -> keep admin card

    for (const lift of primary) {
      if (seen.has(lift.id)) continue;
      seen.add(lift.id);
      const kaLift = kaById.get(lift.id);
      const enLift = enById.get(lift.id);
      // Status/dates are identical across locales; take whichever we have.
      const source = kaLift ?? enLift ?? lift;
      all.push({
        id: lift.id,
        nameKa: kaLift?.name ?? enLift?.name ?? lift.name,
        nameEn: enLift?.name ?? kaLift?.name ?? lift.name,
        open: isLiftOpen(source, now),
      });
    }
  }

  if (all.length === 0) return null;
  return {
    lifts: all,
    openCount: all.filter((l) => l.open).length,
    total: all.length,
  };
}
