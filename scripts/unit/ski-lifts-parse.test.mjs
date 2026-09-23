import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseLiftsFromHtml,
  isLiftOpen,
  summarize,
  tbilisiNow,
} from "../../src/lib/ski-lifts/parse.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(join(here, "fixtures", "ski-lifts", name), "utf8");

// Fixtures are the exact escaped RSC chunks a live fetch of status.mta.ski returns,
// sliced from Wayback captures of the four Bakuriani zone pages.
const didveliKa = fixture("didveli_ka.html"); // 2025-26 season, mixed status 1/2
const didveliEn = fixture("didveli_en.html");
const kokhtaEn = fixture("kokhta_en.html");
const mitarbiEn = fixture("mitarbi_en.html");

test("parseLiftsFromHtml extracts every lift with its id and fields", () => {
  const lifts = parseLiftsFromHtml(didveliKa);
  assert.equal(lifts.length, 6);
  const slalom = lifts[0];
  assert.equal(slalom.id, "28");
  assert.equal(slalom.name, "სლალომი");
  assert.equal(slalom.type, "tbar");
  assert.equal(slalom.status, 1);
  assert.equal(slalom.openTime, "09:00:00");
  assert.equal(slalom.closeTime, "17:00:00");
  assert.equal(slalom.openDate, "2024-12-20");
  assert.equal(slalom.closeDate, "2024-03-24");
});

test("parseLiftsFromHtml reads all Bakuriani zones", () => {
  assert.equal(parseLiftsFromHtml(kokhtaEn).length, 2);
  assert.equal(parseLiftsFromHtml(mitarbiEn).length, 3);
});

test("English and Georgian pages align by lift id, enabling name matching", () => {
  const en = parseLiftsFromHtml(didveliEn);
  const ka = parseLiftsFromHtml(didveliKa);
  const enById = new Map(en.map((l) => [l.id, l.name]));
  const kaById = new Map(ka.map((l) => [l.id, l.name]));
  assert.equal(enById.get("28"), "Slalom");
  assert.equal(kaById.get("28"), "სლალომი");
  assert.equal(enById.get("23"), "Nodo");
  assert.equal(kaById.get("23"), "ნოდო");
  // Same id set on both locales.
  assert.deepEqual([...enById.keys()].sort(), [...kaById.keys()].sort());
});

test("parseLiftsFromHtml returns [] on junk instead of throwing", () => {
  assert.deepEqual(parseLiftsFromHtml(""), []);
  assert.deepEqual(parseLiftsFromHtml("<html>no lifts here</html>"), []);
});

test("parseLiftsFromHtml reassembles a lift split across two flight chunks", () => {
  // Split the single-chunk fixture into two pushes at a byte offset that lands
  // inside a lift object, exactly as Next streams a large payload.
  const chunk = /self\.__next_f\.push\(\[1,"(.*)"\]\)/s.exec(didveliKa)[1];
  const mid = Math.floor(chunk.length / 2);
  const twoChunks =
    `<!doctype html><script>self.__next_f.push([1,"${chunk.slice(0, mid)}"])</script>` +
    `<script>self.__next_f.push([1,"${chunk.slice(mid)}"])</script>`;
  assert.equal(parseLiftsFromHtml(twoChunks).length, 6);
});

test("parseLiftsFromHtml tolerates a renumbered $L component marker", () => {
  // The $L<n> number is per-build; a returning deployment will likely renumber it.
  const renumbered = didveliKa.replace(/\$L12/g, "$L7f");
  assert.equal(parseLiftsFromHtml(renumbered).length, 6);
});

// --- open/closed rule -------------------------------------------------------

const lift = (over = {}) => ({
  id: "1",
  type: "chairlift",
  name: "Test",
  status: 2,
  openTime: "09:00:00",
  closeTime: "17:00:00",
  openDate: "2025-12-20",
  closeDate: "2026-03-30",
  ...over,
});

// 2026-02-25 12:00 Tbilisi: in season, mid-day.
const inSeasonMidday = { ymd: 20260225, minute: 12 * 60 };

test("isLiftOpen: status 2 + in season + within hours => open", () => {
  assert.equal(isLiftOpen(lift(), inSeasonMidday), true);
});

test("isLiftOpen: status 1 is always closed regardless of dates/hours", () => {
  assert.equal(isLiftOpen(lift({ status: 1 }), inSeasonMidday), false);
});

test("isLiftOpen: outside the season window is closed", () => {
  assert.equal(isLiftOpen(lift(), { ymd: 20260401, minute: 12 * 60 }), false); // after close
  assert.equal(isLiftOpen(lift(), { ymd: 20251201, minute: 12 * 60 }), false); // before open
});

test("isLiftOpen: season window is half-open — OFF on the closeDate itself", () => {
  // Matches Luxon Interval.contains (start <= dt < end) in MTA's own component.
  assert.equal(isLiftOpen(lift(), { ymd: 20260329, minute: 12 * 60 }), true); // day before close: open
  assert.equal(isLiftOpen(lift(), { ymd: 20260330, minute: 12 * 60 }), false); // closeDate: closed
  assert.equal(isLiftOpen(lift(), { ymd: 20251220, minute: 12 * 60 }), true); // openDate: open
});

test("isLiftOpen: outside working hours is closed (half-open at close)", () => {
  assert.equal(isLiftOpen(lift(), { ymd: 20260225, minute: 8 * 60 }), false); // before open
  assert.equal(isLiftOpen(lift(), { ymd: 20260225, minute: 9 * 60 }), true); // exactly open
  assert.equal(isLiftOpen(lift(), { ymd: 20260225, minute: 17 * 60 }), false); // exactly close
});

test("isLiftOpen: a reversed/stale date interval is closed (the Slalom case)", () => {
  const stale = lift({ openDate: "2024-12-20", closeDate: "2024-03-24" });
  assert.equal(isLiftOpen(stale, inSeasonMidday), false);
});

test("isLiftOpen: malformed date/time is closed, not a throw", () => {
  assert.equal(isLiftOpen(lift({ openDate: "" }), inSeasonMidday), false);
  assert.equal(isLiftOpen(lift({ openTime: "nope" }), inSeasonMidday), false);
});

test("the archived Feb-2026 Didveli page yields 5 open of 6 by MTA's own rule", () => {
  // Only Slalom (status 1 + stale dates) is closed; the other five are status 2
  // in the 2025-26 window. Evaluated at a mid-season mid-day instant.
  const lifts = parseLiftsFromHtml(didveliKa);
  const open = lifts.filter((l) => isLiftOpen(l, inSeasonMidday)).length;
  assert.equal(open, 5);
});

// --- summarize (the partial-fetch failure modes) ---------------------------

const zonePages = () => [
  { zone: "didveli", locale: "ka", lifts: parseLiftsFromHtml(didveliKa) },
  { zone: "didveli", locale: "en", lifts: parseLiftsFromHtml(didveliEn) },
  { zone: "kokhta", locale: "en", lifts: parseLiftsFromHtml(kokhtaEn) },
  { zone: "kokhta", locale: "ka", lifts: parseLiftsFromHtml(kokhtaEn) }, // no ka capture; reuse en for the test
  { zone: "mitarbi", locale: "en", lifts: parseLiftsFromHtml(mitarbiEn) },
  { zone: "mitarbi", locale: "ka", lifts: parseLiftsFromHtml(mitarbiEn) },
];
const ZONES = ["didveli", "kokhta", "mitarbi"];

test("summarize aggregates every zone and totals open count", () => {
  const s = summarize(zonePages(), ZONES, inSeasonMidday);
  assert.equal(s.total, 11); // 6 + 2 + 3
  assert.equal(s.openCount, 5); // only didveli's 5 status-2 lifts are in season here
});

test("summarize enriches Georgian rows with English names by id", () => {
  const s = summarize(zonePages(), ZONES, inSeasonMidday);
  const nodo = s.lifts.find((l) => l.id === "23");
  assert.equal(nodo.nameKa, "ნოდო");
  assert.equal(nodo.nameEn, "Nodo");
});

test("summarize returns null when any expected zone is missing", () => {
  const missingKokhta = zonePages().filter((p) => p.zone !== "kokhta");
  assert.equal(summarize(missingKokhta, ZONES, inSeasonMidday), null);
});

test("summarize falls back to the en page when the ka page is empty", () => {
  const pages = zonePages().map((p) =>
    p.zone === "didveli" && p.locale === "ka" ? { ...p, lifts: [] } : p,
  );
  const s = summarize(pages, ZONES, inSeasonMidday);
  assert.equal(s.total, 11); // didveli still present via its en page
  const slalom = s.lifts.find((l) => l.id === "28");
  assert.equal(slalom.nameEn, "Slalom"); // en name survives; ka falls back to en
});

test("tbilisiNow reports Tbilisi wall-clock independent of server TZ", () => {
  // 2026-02-25T08:00:00Z === 12:00 in Tbilisi (UTC+4).
  const n = tbilisiNow(new Date("2026-02-25T08:00:00Z"));
  assert.equal(n.ymd, 20260225);
  assert.equal(n.minute, 12 * 60);
});
