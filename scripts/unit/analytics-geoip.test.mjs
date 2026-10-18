// Admin analytics (C49): the IP parsers, the shipped DB-IP table and the city
// names the Georgian and Russian pages show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  lookupGeo,
  parseGeoTable,
  parseIpv4,
  parseIpv6,
} from "../../src/lib/analytics/geoip-core.ts";
import {
  TRANSLATED_CITIES,
  cityDisplayName,
  countryNames,
} from "../../src/lib/analytics/cities.ts";

const root = new URL("../../", import.meta.url);
const table = parseGeoTable(
  gunzipSync(readFileSync(new URL("data/geoip/dbip-lite.bin.gz", root))),
);

test("IPv4 and IPv6 parsing", () => {
  assert.equal(parseIpv4("0.0.0.0"), 0);
  assert.equal(parseIpv4("255.255.255.255"), 0xffffffff);
  assert.equal(
    parseIpv4("188.169.1.1"),
    ((188 * 256 + 169) * 256 + 1) * 256 + 1,
  );
  for (const bad of [
    "256.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "a.b.c.d",
    "",
    "1..2.3",
  ]) {
    assert.equal(parseIpv4(bad), null, bad);
  }
  assert.deepEqual(
    [...parseIpv6("2001:db8::1")],
    [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  );
  assert.deepEqual([...parseIpv6("::")], new Array(16).fill(0));
  assert.deepEqual(
    [...parseIpv6("::ffff:1.2.3.4")].slice(10),
    [0xff, 0xff, 1, 2, 3, 4],
  );
  assert.ok(parseIpv6("fe80::1%eth0"));
  for (const bad of [
    "1::2::3",
    "12345::",
    "1.2.3.4",
    "g::1",
    "1:2:3:4:5:6:7:8:9",
  ]) {
    assert.equal(parseIpv6(bad), null, bad);
  }
});

test("the shipped table: its month, Georgian cities, everything else by country", () => {
  const readme = readFileSync(new URL("data/geoip/README.md", root), "utf8");
  assert.ok(
    readme.includes(`month **${table.month}**`),
    "README names the month",
  );
  assert.ok(table.v4Starts.length > 100_000);
  assert.ok(table.v6Country.length > 100_000);

  for (const ip of ["188.169.1.1", "31.146.1.1", "94.240.200.1"]) {
    assert.deepEqual(
      lookupGeo(table, ip),
      { country: "GE", city: "Tbilisi" },
      ip,
    );
  }
  assert.deepEqual(lookupGeo(table, "8.8.8.8"), { country: "US", city: null });
  assert.deepEqual(lookupGeo(table, "::ffff:8.8.8.8"), {
    country: "US",
    city: null,
  });
  for (const none of ["127.0.0.1", "10.0.0.1", "not-an-ip", "", null]) {
    assert.deepEqual(lookupGeo(table, none), { country: null, city: null });
  }
  assert.ok(lookupGeo(table, "2001:4860:4860::8888").country);
});

test("every city in the table has a Georgian and a Russian name", () => {
  const cities = table.cities.filter(Boolean);
  assert.ok(cities.length > 10);
  const missing = cities.filter((city) => !TRANSLATED_CITIES.includes(city));
  assert.deepEqual(missing, [], "add them to src/lib/analytics/cities.ts");
  assert.equal(cityDisplayName("Tbilisi", "ka"), "თბილისი");
  assert.equal(cityDisplayName("Tbilisi", "ru"), "Тбилиси");
  assert.equal(cityDisplayName("Tbilisi", "en"), "Tbilisi");
  assert.equal(cityDisplayName("Atlantis", "ka"), "Atlantis");
});

test("every country in the table has a name in each language (server ICU)", () => {
  const countries = table.countries.filter(Boolean);
  assert.ok(countries.length > 200);
  for (const locale of ["ka", "en", "ru"]) {
    const names = countryNames(locale);
    const missing = countries.filter((code) => !names[code]);
    assert.deepEqual(missing, [], locale);
    assert.equal(countryNames(locale), names, "built once per language");
  }
  assert.equal(countryNames("ka").GE, "საქართველო");
  assert.equal(countryNames("ru").GE, "Грузия");
  assert.equal(countryNames("en").GE, "Georgia");
  // Unknown codes are left out, never echoed back as a "name".
  assert.equal(countryNames("ka").AA, undefined);
});
