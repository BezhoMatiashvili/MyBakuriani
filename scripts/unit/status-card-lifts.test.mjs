import { test } from "node:test";
import assert from "node:assert/strict";
import { liftsCardFromStatus } from "../../src/lib/status-cards/lifts.ts";

const OPEN = { ka: "ღია", en: "Open", ru: "Открыт" };
const CLOSED = { ka: "დაკეტილი", en: "Closed", ru: "Закрыт" };

function lift(id, status, value = OPEN) {
  return { id, label: { ka: id }, value, status, url: null };
}

function liftsCard(items, value = { ka: "3/5 ღია", en: "3/5 open" }) {
  return {
    id: "lifts",
    icon: "mountain",
    label: { ka: "საბაგიროები" },
    value,
    redDot: false,
    expandable: true,
    active: true,
    items,
  };
}

test("closing lifts in the status dropdown changes the face and their text", () => {
  // What staging held on 2026-10-05: two lifts switched to closed, while their
  // text and the face still said open.
  const card = liftsCard([
    lift("kokhta-1", "ok"),
    lift("kokhta-2", "closed"),
    lift("didveli", "closed"),
    lift("tatra", "closed", CLOSED),
    lift("mitarbi", "closed", CLOSED),
  ]);
  const shown = liftsCardFromStatus(card);
  assert.deepEqual(shown.value, {
    ka: "1/5 ღია",
    en: "1/5 open",
    ru: "1/5 открыты",
  });
  assert.deepEqual(
    shown.items.map((item) => item.value),
    [OPEN, CLOSED, CLOSED, CLOSED, CLOSED],
  );
  // The stored card is not mutated.
  assert.equal(card.value.ka, "3/5 ღია");
  assert.deepEqual(card.items[1].value, OPEN);
});

test("warn and neutral lifts keep their own text and are not counted as open", () => {
  const windHold = { ka: "ქარის გამო შეჩერებულია" };
  const shown = liftsCardFromStatus(
    liftsCard([
      lift("a", "ok", { ka: "" }),
      lift("b", "warn", windHold),
      lift("c", "none", null),
    ]),
  );
  assert.equal(shown.value.ka, "1/3 ღია");
  assert.deepEqual(shown.items[0].value, OPEN);
  assert.deepEqual(shown.items[1].value, windHold);
  assert.equal(shown.items[2].value, null);
});

test("a lifts card without lifts keeps the face the admin typed", () => {
  const card = liftsCard([], { ka: "სეზონი დაიწყება დეკემბერში" });
  assert.equal(liftsCardFromStatus(card), card);
});

test("other cards are left alone", () => {
  const cameras = {
    ...liftsCard([lift("cam", "closed")], { ka: "1 ლოკაცია" }),
    id: "cameras",
  };
  assert.equal(liftsCardFromStatus(cameras), cameras);
});
