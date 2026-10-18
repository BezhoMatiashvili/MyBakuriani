// Live check for the landing lifts card's data source (status.mta.ski). Runs the
// exact parser and merge the card uses (src/lib/ski-lifts/parse.ts) and prints
// what the card would show. Exit 0 only if the card would show live data.
//
//   npm run check:lifts                          # fetch the six live pages
//   npm run check:lifts -- --dir=<folder>        # read <zone>_<locale>.html files
//   npm run check:lifts -- --at=2026-02-25T12:00:00+04:00   # evaluate at an instant
//
// --dir is for saved pages (e.g. Wayback captures), so the success path can be
// exercised while the live site is down. --at sets the moment the open/closed rule
// is evaluated at; it defaults to now.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LIFT_LOCALES,
  LIFT_ZONES,
  MTA_USER_AGENT,
  parseLiftRows,
  parseLiftsFromHtml,
  summarize,
  tbilisiNow,
  zonePageUrl,
} from "../src/lib/ski-lifts/parse.ts";

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg("dir");
const at = arg("at");

const instant = at ? new Date(at) : new Date();
if (Number.isNaN(instant.getTime())) {
  console.error(`Invalid --at=${at}`);
  process.exit(2);
}

async function loadPage(zone, locale) {
  if (dir) {
    const file = join(dir, `${zone}_${locale}.html`);
    if (!existsSync(file)) return { source: `${file} (missing)`, html: null };
    return { source: file, html: readFileSync(file, "utf8") };
  }
  const url = zonePageUrl(zone, locale);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": MTA_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    return {
      source: `${url} -> HTTP ${res.status}`,
      html: res.ok ? await res.text() : null,
    };
  } catch (err) {
    return { source: `${url} -> ${err.name}: ${err.message}`, html: null };
  }
}

const pages = [];
for (const zone of LIFT_ZONES) {
  const ids = {};
  for (const locale of LIFT_LOCALES) {
    const { source, html } = await loadPage(zone, locale);
    const { lifts: rows, markers } = parseLiftRows(html ?? "");
    const lifts = parseLiftsFromHtml(html ?? "");
    let verdict;
    if (html === null) verdict = "no page";
    else if (markers === 0) verdict = "no lift rows found (format changed?)";
    else if (lifts.length === 0)
      verdict = `INCOMPLETE: ${rows.length} of ${markers} rows parsed (format changed?)`;
    else verdict = `ok, ${lifts.length} lifts`;
    console.log(`${locale}/${zone}: ${verdict}\n  ${source}`);
    ids[locale] = lifts.map((l) => l.id).sort();
    pages.push({ zone, locale, lifts });
  }
  if (ids.ka.length > 0 && ids.en.length > 0) {
    const same = ids.ka.join() === ids.en.join();
    console.log(
      same
        ? `  ka/en lift ids match (${ids.ka.join(", ")})`
        : `  ka/en lift ids DIFFER: ka=[${ids.ka}] en=[${ids.en}]`,
    );
  }
}

const now = tbilisiNow(instant);
const summary = summarize(pages, LIFT_ZONES, now);
console.log(
  `\nEvaluated at ${instant.toISOString()} (Tbilisi ${now.ymd} ${String(Math.floor(now.minute / 60)).padStart(2, "0")}:${String(now.minute % 60).padStart(2, "0")})`,
);
if (!summary) {
  console.log(
    "Card: NO live data (a zone yielded no lifts, or its ka/en ids differ) -> the admin card shows.",
  );
  process.exit(1);
}
console.log(
  `Card: ${summary.openCount}/${summary.total} ღია (${summary.openCount}/${summary.total} open)`,
);
for (const lift of summary.lifts) {
  console.log(
    `  ${lift.open ? "open  " : "closed"}  ${lift.nameKa} / ${lift.nameEn}`,
  );
}
