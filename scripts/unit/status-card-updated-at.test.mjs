import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatStatusUpdatedAt,
  stampUpdatedAt,
} from "../../src/lib/status-cards/updated-at.ts";

test("formatStatusUpdatedAt prints Tbilisi time (UTC+4) in each locale", () => {
  const iso = "2026-10-05T06:30:00.000Z";
  assert.equal(formatStatusUpdatedAt(iso, "ka"), "5 ოქტ, 10:30");
  assert.equal(formatStatusUpdatedAt(iso, "en"), "5 Oct, 10:30");
  assert.equal(formatStatusUpdatedAt(iso, "ru"), "5 окт., 10:30");
});

test("formatStatusUpdatedAt rolls the day over at Tbilisi midnight", () => {
  // 21:15 UTC on the 4th is 01:15 on the 5th in Tbilisi.
  assert.equal(
    formatStatusUpdatedAt("2026-10-04T21:15:00Z", "en"),
    "5 Oct, 01:15",
  );
  assert.equal(
    formatStatusUpdatedAt("2026-12-31T20:05:00Z", "ka"),
    "1 იან, 00:05",
  );
});

test("formatStatusUpdatedAt shows nothing for a missing or bad date", () => {
  assert.equal(formatStatusUpdatedAt(undefined, "ka"), null);
  assert.equal(formatStatusUpdatedAt(null, "ka"), null);
  assert.equal(formatStatusUpdatedAt("", "ka"), null);
  assert.equal(formatStatusUpdatedAt("not a date", "ka"), null);
});

test("formatStatusUpdatedAt falls back to Georgian month names", () => {
  assert.equal(
    formatStatusUpdatedAt("2026-10-05T06:30:00Z", "de"),
    "5 ოქტ, 10:30",
  );
});

const card = (id, value, extra = {}) => ({
  id,
  icon: "none",
  label: { ka: id },
  value: { ka: value },
  subValue: null,
  redDot: false,
  expandable: true,
  active: true,
  items: [],
  ...extra,
});

const OLD = "2026-10-01T08:00:00.000Z";
const NOW = "2026-10-05T06:30:00.000Z";

test("stampUpdatedAt keeps the stored date of an unchanged card", () => {
  const [lifts] = stampUpdatedAt(
    [card("lifts", "3/5")],
    [card("lifts", "3/5", { updatedAt: OLD })],
    new Set(),
    NOW,
  );
  assert.equal(lifts.updatedAt, OLD);
});

test("stampUpdatedAt stamps a changed card and leaves the others alone", () => {
  const stamped = stampUpdatedAt(
    [card("lifts", "3/5"), card("cameras", "2 locations")],
    [
      card("lifts", "3/5", { updatedAt: OLD }),
      card("cameras", "1 location", { updatedAt: OLD }),
    ],
    new Set(),
    NOW,
  );
  assert.deepEqual(
    stamped.map((c) => [c.id, c.updatedAt]),
    [
      ["lifts", OLD],
      ["cameras", NOW],
    ],
  );
});

test("stampUpdatedAt stamps an item status change", () => {
  const item = (status) => ({
    id: "lift-didveli",
    label: { ka: "დიდველი" },
    value: null,
    status,
    url: null,
  });
  const [lifts] = stampUpdatedAt(
    [card("lifts", "1/1", { items: [item("closed")] })],
    [card("lifts", "1/1", { items: [item("ok")], updatedAt: OLD })],
    new Set(),
    NOW,
  );
  assert.equal(lifts.updatedAt, NOW);
});

test("stampUpdatedAt stamps an unchanged card the admin marked as checked", () => {
  const [lifts] = stampUpdatedAt(
    [card("lifts", "3/5")],
    [card("lifts", "3/5", { updatedAt: OLD })],
    new Set(["lifts"]),
    NOW,
  );
  assert.equal(lifts.updatedAt, NOW);
});

test("stampUpdatedAt stamps a new card", () => {
  const [fresh] = stampUpdatedAt([card("new", "x")], [], new Set(), NOW);
  assert.equal(fresh.updatedAt, NOW);
});

test("stampUpdatedAt ignores the date the client sent", () => {
  const [lifts] = stampUpdatedAt(
    [card("lifts", "3/5", { updatedAt: "2030-01-01T00:00:00Z" })],
    [card("lifts", "3/5", { updatedAt: OLD })],
    new Set(),
    NOW,
  );
  assert.equal(lifts.updatedAt, OLD);
});

test("stampUpdatedAt gives a never-dated unchanged card no date", () => {
  const [lifts] = stampUpdatedAt(
    [card("lifts", "3/5")],
    [card("lifts", "3/5")],
    new Set(),
    NOW,
  );
  assert.equal(lifts.updatedAt, null);
});
