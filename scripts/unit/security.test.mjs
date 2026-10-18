import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeInternalPath,
  safeHttpsUrl,
  safeCsvCell,
  stripLocalePrefix,
} from "../../src/lib/security.ts";

const LOCALES = ["ka", "en", "ru"];

test("stripLocalePrefix removes one leading locale so the router can add it back", () => {
  assert.equal(stripLocalePrefix("/en/dashboard", LOCALES), "/dashboard");
  assert.equal(
    stripLocalePrefix("/ru/create/service?x=1", LOCALES),
    "/create/service?x=1",
  );
  assert.equal(stripLocalePrefix("/en", LOCALES), "/");
  assert.equal(stripLocalePrefix("/en/", LOCALES), "/");
  assert.equal(stripLocalePrefix("/en?a=1", LOCALES), "/?a=1");
  assert.equal(stripLocalePrefix("/en#top", LOCALES), "/#top");
  assert.equal(stripLocalePrefix("/ka/dashboard", LOCALES), "/dashboard");
  // only a whole segment counts, and only one is removed
  assert.equal(stripLocalePrefix("/english/page", LOCALES), "/english/page");
  assert.equal(stripLocalePrefix("/dashboard", LOCALES), "/dashboard");
  assert.equal(stripLocalePrefix("/en/en/dashboard", LOCALES), "/en/dashboard");
});

test("stripLocalePrefix never turns a path into a protocol-relative URL", () => {
  // safeInternalPath lets "/en//evil.example" through; without the prefix it
  // would read "//evil.example", which the router treats as another origin.
  assert.equal(safeInternalPath("/en//evil.example"), "/en//evil.example");
  const stripped = stripLocalePrefix("/en//evil.example", LOCALES);
  assert.equal(stripped, "/evil.example");
  assert.equal(safeInternalPath(stripped), stripped);
  assert.equal(stripLocalePrefix("/ru////x", LOCALES), "/x");
});

test("safeInternalPath accepts only same-origin absolute paths", () => {
  assert.equal(safeInternalPath("/dashboard/renter"), "/dashboard/renter");
  assert.equal(safeInternalPath("//evil.example/x"), null);
  assert.equal(safeInternalPath("/%2F%2Fevil.example"), null);
  assert.equal(safeInternalPath("https://evil.example"), null);
  assert.equal(safeInternalPath("/a\\b"), null);
  assert.equal(safeInternalPath(42), null);
});

// Login `?next=%2F%09%2Fevil.example`: useSearchParams decodes %09 to a real
// tab, and the URL parser strips it, so "/\t/evil" navigates to //evil.
test("safeInternalPath rejects control characters that URL parsing strips", () => {
  assert.equal(safeInternalPath("/\t/evil.example"), null);
  assert.equal(safeInternalPath("/\n/evil.example"), null);
  assert.equal(safeInternalPath("/\r/evil.example"), null);
  assert.equal(safeInternalPath("/%09/evil.example"), null);
  assert.equal(
    safeInternalPath("/dashboard/renter/calendar?month=2026-09"),
    "/dashboard/renter/calendar?month=2026-09",
  );
});

test("safeHttpsUrl requires https and a hostname", () => {
  assert.equal(safeHttpsUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHttpsUrl("http://example.com/a"), null);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("not a url"), null);
});

test("safeCsvCell neutralises formula / DDE leading characters", () => {
  // Each dangerous leading char gets a leading apostrophe inside the quotes.
  assert.equal(safeCsvCell("=1+1"), "\"'=1+1\"");
  assert.equal(safeCsvCell("+1"), "\"'+1\"");
  assert.equal(safeCsvCell("-1+1"), "\"'-1+1\"");
  assert.equal(safeCsvCell("@SUM(A1)"), "\"'@SUM(A1)\"");
  // TAB and CR/LF are also triggers (stripped by some importers before eval).
  assert.equal(safeCsvCell("\t=1+1"), "\"'\t=1+1\"");
  assert.equal(safeCsvCell("\r=1+1"), "\"'\n=1+1\"");
  assert.equal(safeCsvCell("\n=1+1"), "\"'\n=1+1\"");
});

test("safeCsvCell leaves ordinary values and numbers unchanged", () => {
  assert.equal(safeCsvCell("Nino Beridze"), '"Nino Beridze"');
  assert.equal(safeCsvCell("450.00 GEL"), '"450.00 GEL"');
  assert.equal(safeCsvCell(42), "42");
  assert.equal(safeCsvCell(-5), "-5");
  assert.equal(safeCsvCell(null), '""');
  // Embedded (non-leading) quotes are doubled; embedded CRLF normalised to LF.
  assert.equal(safeCsvCell('a"b'), '"a""b"');
  assert.equal(safeCsvCell("a\r\nb"), '"a\nb"');
});
