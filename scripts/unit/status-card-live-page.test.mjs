import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEmbeddableCamera,
  readingCard,
} from "../../src/lib/status-cards/live-page.ts";
import { DEFAULT_STATUS_CARDS } from "../../src/lib/status-cards/types.ts";

function card(id, items, updatedAt) {
  return {
    id,
    icon: "none",
    label: { ka: id },
    value: { ka: "x" },
    redDot: false,
    expandable: true,
    active: true,
    items,
    updatedAt,
  };
}

const ROW = {
  id: "r",
  label: { ka: "დრო" },
  value: { ka: "2 სთ" },
  status: "none",
};

test("the fallback cards are never printed as a reading", () => {
  for (const id of ["weather", "lifts", "road"]) {
    assert.equal(readingCard(DEFAULT_STATUS_CARDS, id), null, id);
  }
});

test("weather and road print only with rows, lifts only with a real date", () => {
  assert.equal(readingCard([card("road", [])], "road"), null);
  assert.equal(readingCard([card("weather", [])], "weather"), null);
  assert.equal(readingCard([], "road"), null);
  const road = card("road", [ROW]);
  assert.equal(readingCard([road], "road"), road);

  const dated = card("lifts", [ROW], "2026-11-15T08:30:00.000Z");
  assert.equal(readingCard([dated], "lifts"), dated);
  assert.equal(readingCard([card("lifts", [ROW])], "lifts"), null);
  assert.equal(readingCard([card("lifts", [ROW], null)], "lifts"), null);
  assert.equal(readingCard([card("lifts", [ROW], "yesterday")], "lifts"), null);
  assert.equal(
    readingCard([card("lifts", [], "2026-11-15T08:30:00.000Z")], "lifts"),
    null,
  );
});

test("only an https rtsp.me stream is framed", () => {
  assert.equal(isEmbeddableCamera("https://rtsp.me/embed/TaHRrstz/"), true);
  assert.equal(isEmbeddableCamera("http://rtsp.me/embed/TaHRrstz/"), false);
  assert.equal(isEmbeddableCamera("https://cdn.rtsp.me/embed/x/"), false);
  assert.equal(isEmbeddableCamera("https://evil.example/rtsp.me/embed"), false);
  assert.equal(isEmbeddableCamera("https://rtsp.me.evil.example/"), false);
  assert.equal(isEmbeddableCamera("not a url"), false);
  assert.equal(isEmbeddableCamera(""), false);
});
