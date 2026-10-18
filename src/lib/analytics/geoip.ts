import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  lookupGeo,
  parseGeoTable,
  type GeoResult,
  type GeoTable,
} from "@/lib/analytics/geoip-core";

// Country (+ city inside Georgia) of a request's client IP for analytics hits
// (C49). DigitalOcean App Platform does not forward Cloudflare's location
// headers, so the lookup runs here, on getClientIp's address, over the DB-IP
// Lite table built by scripts/geoip/build-geoip.mjs. The file is read from the
// checkout like the PDF fonts (src/lib/finance/pdf.ts): `npm start` runs there.
// The address itself is never stored.

const TABLE_FILE = join(process.cwd(), "data", "geoip", "dbip-lite.bin.gz");
const NONE: GeoResult = { country: null, city: null };

let table: Promise<GeoTable | null> | null = null;

function loadTable(): Promise<GeoTable | null> {
  table ??= readFile(TABLE_FILE)
    .then((gz) => parseGeoTable(gunzipSync(gz)))
    .catch((error: unknown) => {
      // Analytics must never fail a request: without the table every hit is
      // recorded with an unknown location.
      console.error(
        "[geoip] table unavailable",
        error instanceof Error ? error.message : error,
      );
      return null;
    });
  return table;
}

export async function lookupClientGeo(ip: string): Promise<GeoResult> {
  const loaded = await loadTable();
  return loaded ? lookupGeo(loaded, ip) : NONE;
}
