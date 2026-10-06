import { test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath, safeHttpsUrl, safeCsvCell } from "../../src/lib/security.ts";

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
