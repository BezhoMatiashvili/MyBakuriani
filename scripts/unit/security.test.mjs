import { test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath, safeHttpsUrl } from "../../src/lib/security.ts";

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
