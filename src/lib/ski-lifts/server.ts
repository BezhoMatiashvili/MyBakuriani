import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { timeoutFetch } from "@/lib/with-timeout";
import {
  inventoryResponseFresh,
  MTA_FETCHED_AT_HEADER,
  MTA_INVENTORY_URL,
  MTA_USER_AGENT,
  parseInventory,
  type LiftsSummary,
} from "./parse";

export { withLiveLifts, type LiftsSummary } from "./parse";

// Live Bakuriani lift status for the landing "lifts" card, from MTA's feed
// (read and checked in ./parse.ts, unit-tested against a saved answer). Same
// shape as src/lib/road-condition/server.ts: a server-side fetch behind
// cache() + a revalidate window, and ANY failure (HTTP error, timeout, stale
// or unreadable answer) yields null, so the admin-editable card shows instead
// of a blank or wrong one. Server-side only (Node), so it needs no CSP
// connect-src / remotePatterns entry: C6 covers browser and next/image hosts.
// `npm run check:lifts` prints what a live fetch would show.

export const LIFTS_REVALIDATE_SECONDS = 5 * 60;
const LIFTS_FETCH_TIMEOUT_MS = 5000;

// unstable_cache keeps the outcome, summary or null, for the window, so a
// failing feed costs one request per window like a working one (Next's fetch
// cache keeps only 200s: while status.mta.ski answered 500, every /search
// render re-fetched, 2026-10-04). One request serves every locale: the ka and
// en answers are identical.
const getSkiLiftsCached = unstable_cache(
  async (): Promise<LiftsSummary | null> => {
    try {
      const res = await timeoutFetch(LIFTS_FETCH_TIMEOUT_MS)(
        MTA_INVENTORY_URL,
        {
          headers: {
            "user-agent": MTA_USER_AGENT,
            accept: "application/json",
          },
        },
      );
      if (!res.ok) return null;
      if (
        !inventoryResponseFresh(
          res.headers.get(MTA_FETCHED_AT_HEADER),
          res.headers.get("age"),
        )
      ) {
        return null;
      }
      return parseInventory(await res.json());
    } catch {
      return null;
    }
  },
  ["ski-lifts-mta-inventory"],
  { revalidate: LIFTS_REVALIDATE_SECONDS },
);

export const getSkiLifts = cache((): Promise<LiftsSummary | null> =>
  getSkiLiftsCached(),
);
