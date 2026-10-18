// When an admin last changed a status card, and how the public card shows it.
// Pure (no `@/` imports) so scripts/unit/status-card-updated-at.test.mjs can
// import it.

import { enUS, ka, ru } from "date-fns/locale";
import type { Locale, Month } from "date-fns";
import type { StatusCard } from "./types";

// Cards whose public face carries the last-update date: the hand-maintained
// ones. Weather and road are live readings, cameras are stream links.
export const UPDATED_AT_CARD_IDS = new Set(["lifts"]);

const MONTH_LOCALES: Record<string, Locale> = { ka, en: enUS, ru };

// Georgia keeps UTC+4 all year (no DST since 2005).
const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;

// "5 ოქტ, 10:30" in Tbilisi time. Built from UTC getters and date-fns' bundled
// month names, never the runtime's time zone or ICU data, so the server render
// and the browser's hydration print the same text. Absolute on purpose: the
// pages are ISR and edge-cached, so "2 hours ago" would go stale.
export function formatStatusUpdatedAt(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const t = new Date(ms + TBILISI_OFFSET_MS);
  const month = (MONTH_LOCALES[locale] ?? ka).localize.month(
    t.getUTCMonth() as Month,
    { width: "abbreviated" },
  );
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${t.getUTCDate()} ${month}, ${hh}:${mm}`;
}

// Gives every sanitized incoming card its `updatedAt`: `now` when the card is
// new, its content differs from the stored card with the same id, or the admin
// marked it as checked; otherwise the stored date is kept. Both sides must have
// gone through the same sanitizer, or shape drift (a missing vs null field)
// would count as a change. Whatever `updatedAt` the client sent is ignored.
export function stampUpdatedAt(
  incoming: StatusCard[],
  stored: StatusCard[],
  markedIds: ReadonlySet<string>,
  now: string,
): StatusCard[] {
  const storedById = new Map(stored.map((card) => [card.id, card]));
  return incoming.map((card) => {
    const previous = storedById.get(card.id);
    const unchanged =
      previous !== undefined &&
      !markedIds.has(card.id) &&
      contentOf(previous) === contentOf(card);
    return {
      ...card,
      updatedAt: unchanged ? (previous.updatedAt ?? null) : now,
    };
  });
}

// The card without its date (JSON.stringify drops undefined keys).
function contentOf(card: StatusCard): string {
  return JSON.stringify({ ...card, updatedAt: undefined });
}
