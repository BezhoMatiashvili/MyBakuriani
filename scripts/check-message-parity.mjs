// Verifies messages/ka.json, en.json, ru.json have identical key sets.
import { readFileSync } from "node:fs";

const locales = ["ka", "en", "ru"];
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

const keysets = Object.fromEntries(
  locales.map((l) => [
    l,
    new Set(flatten(JSON.parse(readFileSync(`messages/${l}.json`, "utf8")))),
  ]),
);

let ok = true;
for (const a of locales) {
  for (const b of locales) {
    if (a === b) continue;
    const missing = [...keysets[a]].filter((k) => !keysets[b].has(k));
    if (missing.length) {
      ok = false;
      console.error(
        `Keys in ${a}.json missing from ${b}.json (${missing.length}):`,
      );
      for (const k of missing) console.error(`  ${k}`);
    }
  }
}

if (ok) {
  console.log(
    `OK: all locales have identical key sets (${keysets.ka.size} keys).`,
  );
} else {
  process.exit(1);
}
