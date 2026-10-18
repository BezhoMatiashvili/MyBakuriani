#!/usr/bin/env node
// Builds data/geoip/dbip-lite.bin.gz, the IP -> country (+ city inside Georgia)
// table the analytics beacon uses (C49). Source: DB-IP "IP to City Lite"
// (CC BY 4.0, https://db-ip.com, monthly). The admin analytics page must keep
// the "IP Geolocation by DB-IP" link while this data is used.
//
// Usage (monthly, from the repo root; no dependencies):
//   node scripts/geoip/build-geoip.mjs [--month YYYY-MM] [--cache DIR] [--out FILE]
//
// The CSV (~85 MB gz) is downloaded into --cache (default ~/.cache/mb-geoip)
// unless it is already there. Only derived country/city ranges are written; the
// output keeps every country worldwide but cities for Georgia only, which keeps
// the file a few MB instead of the 120+ MB city database.
//
// Binary layout (little endian), gzip-compressed:
//   "MBGEO1" | u8 month length | month (ASCII)
//   u16 country count | 2 ASCII bytes each (index 0 = "" unknown)
//   u16 city count | per city: u8 byte length + UTF-8 (index 0 = "" none)
//   u32 v4 count | u32 starts | u8 country index | u16 city index
//   u32 v6 count | 16-byte big-endian starts | u8 country index | u16 city index
// Starts are sorted and cover the address space without gaps; the entry for an
// address is the last start <= address.

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
} from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, gzipSync } from "node:zlib";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

const now = new Date();
const month = arg(
  "month",
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
);
if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`bad --month ${month}`);
const cacheDir = resolve(arg("cache", join(homedir(), ".cache", "mb-geoip")));
const outFile = resolve(arg("out", "data/geoip/dbip-lite.bin.gz"));
const csvName = `dbip-city-lite-${month}.csv.gz`;
const csvPath = join(cacheDir, csvName);

async function download() {
  if (existsSync(csvPath)) return;
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://download.db-ip.com/free/${csvName}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
  const part = `${csvPath}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  await rename(part, csvPath);
}

/** Splits one CSV line (DB-IP quotes fields that contain commas). */
function splitCsv(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** "K'obulet'i" -> "Kobuleti", "Tbilisi (Old Tbilisi)" -> "Tbilisi". */
function cleanName(value) {
  return value
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/['’ʼ`]/g, "")
    .trim();
}

function ipv4ToNumber(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function ipv6ToBigInt(ip) {
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, null];
  const h = head ? head.split(":") : [];
  const t = tail === null ? [] : tail ? tail.split(":") : [];
  const fill = tail === null ? 0 : 8 - h.length - t.length;
  const groups = [...h, ...Array(fill).fill("0"), ...t];
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

const countries = [""];
const countryIndex = new Map([["", 0]]);
const cities = [""];
const cityIndex = new Map([["", 0]]);

function indexOf(list, map, value) {
  let index = map.get(value);
  if (index === undefined) {
    index = list.length;
    list.push(value);
    map.set(value, index);
  }
  return index;
}

/** Ranges per family, merged while consecutive entries share country+city. */
function family() {
  const starts = [];
  const country = [];
  const city = [];
  let nextExpected = 0n;
  return {
    starts,
    country,
    city,
    push(start, end, c, ci) {
      if (start < nextExpected) return; // overlapping row: keep the first
      if (start > nextExpected) {
        // Gap: an explicit unknown range so lookups never borrow a neighbour.
        starts.push(nextExpected);
        country.push(0);
        city.push(0);
      }
      const last = starts.length - 1;
      if (!(last >= 0 && country[last] === c && city[last] === ci)) {
        starts.push(start);
        country.push(c);
        city.push(ci);
      }
      nextExpected = end + 1n;
    },
  };
}

const v4 = family();
const v6 = family();

async function parse() {
  const lines = createInterface({
    input: createReadStream(csvPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let rows = 0;
  let georgian = 0;
  for await (const line of lines) {
    if (!line) continue;
    const [start, end, , cc, region, cityName] = splitCsv(line);
    const isV6 = start.includes(":");
    const s = isV6 ? ipv6ToBigInt(start) : ipv4ToNumber(start);
    const e = isV6 ? ipv6ToBigInt(end) : ipv4ToNumber(end);
    if (s === null || e === null) continue;
    rows += 1;
    const code = /^[A-Z]{2}$/.test(cc) && cc !== "ZZ" ? cc : "";
    let cityValue = "";
    if (code === "GE") {
      georgian += 1;
      cityValue =
        cleanName(region ?? "") === "Tbilisi"
          ? "Tbilisi"
          : cleanName(cityName ?? "");
    }
    const c = indexOf(countries, countryIndex, code);
    const ci = indexOf(cities, cityIndex, cityValue);
    (isV6 ? v6 : v4).push(BigInt(s), BigInt(e), c, ci);
  }
  return { rows, georgian };
}

function encode() {
  if (countries.length > 255) throw new Error("too many countries for u8");
  if (cities.length > 65535) throw new Error("too many cities for u16");
  const chunks = [];
  const u8 = (n) => chunks.push(Uint8Array.of(n));
  const u16 = (n) => {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    chunks.push(b);
  };
  const u32 = (n) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    chunks.push(b);
  };
  const encoder = new TextEncoder();
  chunks.push(encoder.encode("MBGEO1"));
  u8(month.length);
  chunks.push(encoder.encode(month));
  u16(countries.length);
  for (const code of countries) {
    chunks.push(
      Uint8Array.of(code.charCodeAt(0) || 0, code.charCodeAt(1) || 0),
    );
  }
  u16(cities.length);
  for (const name of cities) {
    const bytes = encoder.encode(name);
    if (bytes.length > 255) throw new Error(`city name too long: ${name}`);
    u8(bytes.length);
    chunks.push(bytes);
  }
  const indexes = (list) => {
    const out = new Uint8Array(list.length * 2);
    const view = new DataView(out.buffer);
    list.forEach((c, i) => view.setUint16(i * 2, c, true));
    return out;
  };
  // IPv4
  u32(v4.starts.length);
  const v4Starts = new Uint8Array(v4.starts.length * 4);
  const v4View = new DataView(v4Starts.buffer);
  v4.starts.forEach((s, i) => v4View.setUint32(i * 4, Number(s), true));
  chunks.push(v4Starts, Uint8Array.from(v4.country), indexes(v4.city));
  // IPv6: big-endian 16-byte starts, so byte order compares like the number.
  u32(v6.starts.length);
  const v6Starts = new Uint8Array(v6.starts.length * 16);
  v6.starts.forEach((s, i) => {
    let n = s;
    for (let b = 15; b >= 0; b -= 1) {
      v6Starts[i * 16 + b] = Number(n & 0xffn);
      n >>= 8n;
    }
  });
  chunks.push(v6Starts, Uint8Array.from(v6.country), indexes(v6.city));
  return Buffer.concat(
    chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)),
  );
}

await download();
const { rows, georgian } = await parse();
const raw = encode();
const gz = gzipSync(raw, { level: 9 });
mkdirSync(dirname(outFile), { recursive: true });
await writeFile(outFile, gz);
console.log(
  JSON.stringify(
    {
      month,
      rows,
      georgianRows: georgian,
      v4Ranges: v4.starts.length,
      v6Ranges: v6.starts.length,
      countries: countries.length - 1,
      georgianCities: cities.length - 1,
      rawBytes: raw.length,
      gzipBytes: gz.length,
      out: outFile,
    },
    null,
    2,
  ),
);
