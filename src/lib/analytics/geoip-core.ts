// IP -> { country, city } over the table scripts/geoip/build-geoip.mjs writes
// (data/geoip/dbip-lite.bin.gz, DB-IP Lite, CC BY 4.0). Country for every
// address, city only inside Georgia. Pure (no imports) so scripts/unit can load
// it; src/lib/analytics/geoip.ts reads the file and caches the parsed table.
// The IP is only looked up, never stored (C49).

export type GeoTable = {
  month: string;
  countries: string[];
  cities: string[];
  v4Starts: Uint32Array;
  v4Country: Uint8Array;
  v4City: Uint16Array;
  /** 16 big-endian bytes per start. */
  v6Starts: Uint8Array;
  v6Country: Uint8Array;
  v6City: Uint16Array;
};

export type GeoResult = { country: string | null; city: string | null };

const NONE: GeoResult = { country: null, city: null };

/** Parses the uncompressed table (throws on a malformed file). */
export function parseGeoTable(bytes: Uint8Array): GeoTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  if (decoder.decode(bytes.subarray(0, 6)) !== "MBGEO1") {
    throw new Error("geoip: bad magic");
  }
  let o = 6;
  const monthLength = bytes[o];
  o += 1;
  const month = decoder.decode(bytes.subarray(o, o + monthLength));
  o += monthLength;

  const countryCount = view.getUint16(o, true);
  o += 2;
  const countries: string[] = [];
  for (let i = 0; i < countryCount; i += 1) {
    const a = bytes[o];
    const b = bytes[o + 1];
    countries.push(a && b ? String.fromCharCode(a, b) : "");
    o += 2;
  }

  const cityCount = view.getUint16(o, true);
  o += 2;
  const cities: string[] = [];
  for (let i = 0; i < cityCount; i += 1) {
    const length = bytes[o];
    o += 1;
    cities.push(decoder.decode(bytes.subarray(o, o + length)));
    o += length;
  }

  const v4Count = view.getUint32(o, true);
  o += 4;
  const v4Starts = new Uint32Array(v4Count);
  for (let i = 0; i < v4Count; i += 1) {
    v4Starts[i] = view.getUint32(o + i * 4, true);
  }
  o += v4Count * 4;
  const v4Country = bytes.slice(o, o + v4Count);
  o += v4Count;
  const v4City = new Uint16Array(v4Count);
  for (let i = 0; i < v4Count; i += 1) {
    v4City[i] = view.getUint16(o + i * 2, true);
  }
  o += v4Count * 2;

  const v6Count = view.getUint32(o, true);
  o += 4;
  const v6Starts = bytes.slice(o, o + v6Count * 16);
  o += v6Count * 16;
  const v6Country = bytes.slice(o, o + v6Count);
  o += v6Count;
  const v6City = new Uint16Array(v6Count);
  for (let i = 0; i < v6Count; i += 1) {
    v6City[i] = view.getUint16(o + i * 2, true);
  }
  o += v6Count * 2;
  if (o !== bytes.byteLength) throw new Error("geoip: trailing bytes");

  return {
    month,
    countries,
    cities,
    v4Starts,
    v4Country,
    v4City,
    v6Starts,
    v6Country,
    v6City,
  };
}

/** Dotted IPv4 -> unsigned 32-bit number, else null. */
export function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** IPv6 (with ::, an optional zone id, an embedded IPv4 tail) -> 16 bytes. */
export function parseIpv6(ip: string): Uint8Array | null {
  let value = ip.trim();
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (!value.includes(":")) return null;
  let tailV4: number | null = null;
  const lastColon = value.lastIndexOf(":");
  if (value.slice(lastColon + 1).includes(".")) {
    tailV4 = parseIpv4(value.slice(lastColon + 1));
    if (tailV4 === null) return null;
    value = `${value.slice(0, lastColon + 1)}0:0`;
  }
  const double = value.indexOf("::");
  if (double !== value.lastIndexOf("::")) return null;
  const head = double === -1 ? value : value.slice(0, double);
  const tail = double === -1 ? "" : value.slice(double + 2);
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = double === -1 ? 0 : 8 - h.length - t.length;
  if (fill < 0) return null;
  const groups = [...h, ...Array<string>(fill).fill("0"), ...t];
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const g = parseInt(groups[i], 16);
    out[i * 2] = g >> 8;
    out[i * 2 + 1] = g & 0xff;
  }
  if (tailV4 !== null) {
    out[12] = (tailV4 >>> 24) & 0xff;
    out[13] = (tailV4 >>> 16) & 0xff;
    out[14] = (tailV4 >>> 8) & 0xff;
    out[15] = tailV4 & 0xff;
  }
  return out;
}

function compare16(a: Uint8Array, offset: number, b: Uint8Array): number {
  for (let i = 0; i < 16; i += 1) {
    const d = a[offset + i] - b[i];
    if (d !== 0) return d;
  }
  return 0;
}

function result(table: GeoTable, country: number, city: number): GeoResult {
  return {
    country: table.countries[country] || null,
    city: table.cities[city] || null,
  };
}

/** Country (ISO alpha-2) and, inside Georgia, city of an address. */
export function lookupGeo(
  table: GeoTable,
  ip: string | null | undefined,
): GeoResult {
  if (typeof ip !== "string" || ip.length === 0 || ip.length > 64) return NONE;
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  const v4 = parseIpv4(mapped ? mapped[1] : trimmed);
  if (v4 !== null) {
    let lo = 0;
    let hi = table.v4Starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (table.v4Starts[mid] <= v4) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found === -1
      ? NONE
      : result(table, table.v4Country[found], table.v4City[found]);
  }
  const v6 = parseIpv6(trimmed);
  if (!v6) return NONE;
  let lo = 0;
  let hi = table.v6Country.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (compare16(table.v6Starts, mid * 16, v6) <= 0) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found === -1
    ? NONE
    : result(table, table.v6Country[found], table.v6City[found]);
}
