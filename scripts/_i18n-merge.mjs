// Temporary helper: merges additions into messages/{ka,en,ru}.json. Deleted after the migration.
import { readFileSync, writeFileSync } from "node:fs";

function deepMerge(target, source) {
  const out = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function merge(additions) {
  for (const locale of ["ka", "en", "ru"]) {
    const path = `messages/${locale}.json`;
    const data = JSON.parse(readFileSync(path, "utf8"));
    for (const [ns, keys] of Object.entries(additions[locale])) {
      data[ns] = deepMerge(data[ns], keys);
    }
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  }
  console.log("merged");
}
