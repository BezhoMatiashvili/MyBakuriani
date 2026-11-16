import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  inventoryResponseFresh,
  liftDisplayName,
  parseInventory,
  readInventory,
  withLiveLifts,
} from "../../src/lib/ski-lifts/parse.ts";

const here = dirname(fileURLToPath(import.meta.url));

// The exact answer of GET https://mta.ski/api/operations-inventory?slug=
// bakuriani&locale=ka on 2026-11-14 (off-season: every lift CLOSED).
const fixture = () =>
  JSON.parse(
    readFileSync(
      join(here, "fixtures", "ski-lifts", "bakuriani-inventory.json"),
      "utf8",
    ),
  );

const SLALOM = "c583938f-26fc-48a4-821b-07c0c24956c5";
const KOKHTA_PLATO = "653fecfd-3654-4d43-8c2d-1958ce428538";
const NODO = "e940de13-a228-4463-86de-498b7dfad273";
const DEKA = "386bc251-9144-42db-bf31-91d8662ebe53";

// The saved answer with some assets' statuses replaced.
function withStatuses(byId) {
  const body = fixture();
  for (const asset of body.assets) {
    if (asset.assetId in byId) asset.effectiveStatus = byId[asset.assetId];
  }
  return body;
}

test("the saved answer reads as 12 closed lifts", () => {
  const summary = parseInventory(fixture());
  assert.ok(summary);
  assert.equal(summary.total, 12);
  assert.equal(summary.openCount, 0);
  assert.ok(summary.lifts.every((lift) => lift.status === "CLOSED"));
  // Newest lastVerifiedAt among the lifts, normalized to 3 digits.
  assert.equal(summary.verifiedAt, "2026-11-04T12:57:48.692Z");
});

test("trails are checked but not listed", () => {
  const body = fixture();
  assert.equal(body.assets.length, 51);
  const ids = parseInventory(body).lifts.map((lift) => lift.id);
  const trailIds = body.assets
    .filter((asset) => asset.type === "trail")
    .map((asset) => asset.assetId);
  assert.ok(trailIds.every((id) => !ids.includes(id)));
});

test("names: MTA's published Georgian names, else MTA's name recased", () => {
  const byId = new Map(parseInventory(fixture()).lifts.map((l) => [l.id, l]));
  assert.equal(byId.get(SLALOM).nameKa, "სლალომი");
  assert.equal(byId.get(SLALOM).nameEn, "Slalom");
  assert.equal(byId.get(NODO).nameKa, "ნოდო");
  assert.equal(byId.get(KOKHTA_PLATO).nameKa, "Kokhta-Plato");
  assert.equal(byId.get(KOKHTA_PLATO).nameEn, "Kokhta-Plato");
});

test("liftDisplayName recases only all-caps Latin", () => {
  assert.equal(liftDisplayName("KOKHTA-PLATO"), "Kokhta-Plato");
  assert.equal(liftDisplayName("MITARBI 3"), "Mitarbi 3");
  assert.equal(liftDisplayName(" SLOPE STYLE "), "Slope Style");
  assert.equal(liftDisplayName("Kokhta Plateau"), "Kokhta Plateau");
  assert.equal(liftDisplayName("კოხტა"), "კოხტა");
});

test("only OPEN counts as open", () => {
  const summary = parseInventory(
    withStatuses({
      [SLALOM]: "OPEN",
      [NODO]: "OPEN",
      [DEKA]: "DISRUPTED",
      [KOKHTA_PLATO]: "PENDING_CONFIRMATION",
    }),
  );
  assert.equal(summary.openCount, 2);
  assert.equal(summary.total, 12);
});

test("every lift awaiting confirmation: no live card", () => {
  const body = fixture();
  for (const asset of body.assets) {
    if (asset.type === "lift") asset.effectiveStatus = "PENDING_CONFIRMATION";
  }
  assert.equal(parseInventory(body), null);
});

test("the answer is refused whole when MTA's client would refuse it", () => {
  const cases = {
    "not ready": (b) => (b.state = "loading"),
    "area not ready": (b) => (b.areas[0].state = "unavailable"),
    "no areas": (b) => (b.areas = []),
    "assets missing": (b) => delete b.assets,
    "unknown status on a trail": (b) => {
      b.assets.find((a) => a.type === "trail").effectiveStatus = "SNOWING";
    },
    "duplicate id": (b) => b.assets.push({ ...b.assets[0] }),
    "lift without a name": (b) => (b.assets[0].name = " "),
    "lift count differs from liftsTotal": (b) => (b.areas[0].liftsTotal = 13),
    "no lifts at all": (b) => {
      b.assets = b.assets.filter((a) => a.type !== "lift");
      b.areas[0].liftsTotal = 0;
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const body = fixture();
    mutate(body);
    const reading = readInventory(body);
    assert.equal(reading.ok, false, name);
    assert.equal(parseInventory(body), null, name);
  }
  assert.equal(parseInventory(null), null);
  assert.equal(parseInventory([]), null);
});

test("freshness follows MTA's 75 s rule", () => {
  const now = Date.parse("2026-11-14T18:24:10.232Z");
  const at = (ms) => new Date(now + ms).toISOString();
  assert.equal(inventoryResponseFresh(at(0), null, now), true);
  assert.equal(inventoryResponseFresh(at(-75_000), "0", now), true);
  assert.equal(inventoryResponseFresh(at(-75_001), null, now), false);
  assert.equal(inventoryResponseFresh(at(60_000), null, now), true);
  assert.equal(inventoryResponseFresh(at(60_001), null, now), false);
  assert.equal(inventoryResponseFresh(at(0), "75", now), true);
  assert.equal(inventoryResponseFresh(at(0), "76", now), false);
  assert.equal(inventoryResponseFresh(at(0), "-1", now), false);
  assert.equal(inventoryResponseFresh(null, null, now), false);
  assert.equal(inventoryResponseFresh("soon", null, now), false);
});

const adminCards = () => [
  {
    id: "weather",
    icon: "none",
    label: { ka: "ამინდი" },
    value: { ka: "-4°C" },
    redDot: false,
    expandable: false,
    active: true,
    items: [],
  },
  {
    id: "lifts",
    icon: "mountain",
    label: { ka: "საბაგიროები", en: "Ski lifts", ru: "Подъёмники" },
    value: { ka: "0/5 ღია" },
    subValue: { ka: "კოხტა 1, კოხტა 2…" },
    redDot: true,
    expandable: false,
    active: true,
    items: [
      {
        id: "lift-kokhta-1",
        label: { ka: "კოხტა 1" },
        value: { ka: "დაკეტილი" },
        status: "closed",
      },
    ],
    updatedAt: "2026-10-05T09:50:21.333Z",
  },
];

test("withLiveLifts replaces the admin's lifts and date, keeps the rest", () => {
  const summary = parseInventory(
    withStatuses({ [NODO]: "OPEN", [DEKA]: "DISRUPTED", [SLALOM]: "OPEN" }),
  );
  const [weather, lifts] = withLiveLifts(adminCards(), summary);
  assert.deepEqual(weather, adminCards()[0]);
  assert.deepEqual(lifts.value, {
    ka: "2/12 ღია",
    en: "2/12 open",
    ru: "2/12 открыты",
  });
  assert.equal(lifts.items.length, 12);
  assert.equal(lifts.expandable, true);
  assert.equal(lifts.updatedAt, "2026-11-04T12:57:48.692Z");
  // Admin-owned fields stay.
  assert.equal(lifts.redDot, true);
  assert.equal(lifts.icon, "mountain");
  assert.deepEqual(lifts.label, adminCards()[1].label);
  // Preview: the first two open lifts, in feed order.
  assert.deepEqual(lifts.subValue, {
    ka: "სლალომი, ნოდო",
    en: "Slalom, Nodo",
    ru: "Slalom, Nodo",
  });

  const row = (id) => lifts.items.find((item) => item.id === `lift-${id}`);
  assert.equal(row(SLALOM).status, "ok");
  assert.equal(row(SLALOM).value.ka, "ღია");
  assert.equal(row(DEKA).status, "warn");
  assert.equal(row(DEKA).value.ka, "შეფერხებულია");
  assert.equal(row(KOKHTA_PLATO).status, "closed");
  assert.equal(row(KOKHTA_PLATO).value.ka, "დაკეტილი");
  assert.equal(row(KOKHTA_PLATO).label.ru, "Kokhta-Plato");
});

test("pending lifts get no dot; none open previews every lift", () => {
  const [, lifts] = withLiveLifts(
    adminCards(),
    parseInventory(withStatuses({ [SLALOM]: "PENDING_CONFIRMATION" })),
  );
  const slalom = lifts.items.find((item) => item.id === `lift-${SLALOM}`);
  assert.equal(slalom.status, "none");
  assert.equal(slalom.value.en, "Unconfirmed");
  assert.equal(lifts.subValue.en, "Slalom, Kokhta-Plato…");
});

test("no live reading leaves the admin cards untouched", () => {
  assert.deepEqual(withLiveLifts(adminCards(), null), adminCards());
  const noLifts = adminCards().filter((card) => card.id !== "lifts");
  assert.deepEqual(withLiveLifts(noLifts, parseInventory(fixture())), noLifts);
});
