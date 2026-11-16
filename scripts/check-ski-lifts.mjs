// Live check for the landing lifts card's data source (MTA's operations feed).
// Runs the exact checks and overlay the card uses (src/lib/ski-lifts/parse.ts)
// and prints what the card would show. Exit 0 only if the card would show
// live data.
//
//   npm run check:lifts                    # fetch the live feed
//   npm run check:lifts -- --file=<json>   # read a saved answer (no freshness check)
import { readFileSync } from "node:fs";
import {
  inventoryResponseFresh,
  MTA_FETCHED_AT_HEADER,
  MTA_INVENTORY_URL,
  MTA_USER_AGENT,
  readInventory,
  withLiveLifts,
} from "../src/lib/ski-lifts/parse.ts";

const file = process.argv
  .find((a) => a.startsWith("--file="))
  ?.slice("--file=".length);

async function load() {
  if (file)
    return { source: file, body: JSON.parse(readFileSync(file, "utf8")) };
  try {
    const res = await fetch(MTA_INVENTORY_URL, {
      headers: { "user-agent": MTA_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const fetchedAt = res.headers.get(MTA_FETCHED_AT_HEADER);
    const age = res.headers.get("age");
    console.log(
      `${MTA_INVENTORY_URL} -> HTTP ${res.status}, ${MTA_FETCHED_AT_HEADER}: ${fetchedAt ?? "(none)"}, age: ${age ?? "(none)"}`,
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (!inventoryResponseFresh(fetchedAt, age)) {
      return { error: "answer is not fresh (MTA's 75 s rule)" };
    }
    return { source: MTA_INVENTORY_URL, body: await res.json() };
  } catch (err) {
    return { error: `${err.name}: ${err.message}` };
  }
}

const loaded = await load();
const reading = loaded.error
  ? { ok: false, reason: loaded.error }
  : readInventory(loaded.body);
if (!reading.ok) {
  console.log(
    `Card: NO live data (${reading.reason}) -> the admin card shows.`,
  );
  process.exit(1);
}

const lifts = withLiveLifts(
  [{ id: "lifts", items: [], value: { ka: "" } }],
  reading.summary,
)[0];
console.log(`Read: ${loaded.source}`);
console.log(
  `Card: ${lifts.value.ka} (${lifts.value.en}), MTA last verified ${lifts.updatedAt ?? "(never)"}`,
);
for (const item of lifts.items) {
  console.log(
    `  ${item.status.padEnd(6)} ${item.value.ka.padEnd(16)} ${item.label.ka} / ${item.label.en}`,
  );
}
