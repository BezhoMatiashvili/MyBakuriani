// The lifts card is kept by hand: the admin marks each lift ღია (ok) or
// დაკეტილი (closed) with its status. Until 2026-10-05 that status only colored
// a dot, while the card face ("3/5 ღია") and each lift's text were separate
// free-text fields, so closing a lift changed nothing a visitor could read.
// Now the status decides both. Applied on every public read (server.ts) and by
// the admin API's sanitizer, so stored and shown cards agree. Pure (no `@/`
// imports) so scripts/unit/status-card-lifts.test.mjs can import it.

import type {
  LocalizedText,
  StatusCard,
  StatusCardItem,
  StatusKind,
} from "./types";

export const LIFTS_CARD_ID = "lifts";

// Same words as the admin's status dropdown (AdminStatusCards.statusOk /
// statusClosed). A warn or neutral lift keeps the admin's own text.
export function liftTextFromStatus(status: StatusKind): LocalizedText | null {
  if (status === "ok") return { ka: "ღია", en: "Open", ru: "Открыт" };
  if (status === "closed") {
    return { ka: "დაკეტილი", en: "Closed", ru: "Закрыт" };
  }
  return null;
}

// "N/M ღია": N = lifts marked ok, M = every lift on the card. Null for any
// other card, or a lifts card without lifts (its face stays as typed).
export function liftsFaceValue(card: StatusCard): LocalizedText | null {
  if (card.id !== LIFTS_CARD_ID || card.items.length === 0) return null;
  const open = card.items.filter((item) => item.status === "ok").length;
  const count = `${open}/${card.items.length}`;
  return { ka: `${count} ღია`, en: `${count} open`, ru: `${count} открыты` };
}

// The card as visitors see it. Any other card comes back unchanged.
export function liftsCardFromStatus(card: StatusCard): StatusCard {
  const face = liftsFaceValue(card);
  if (!face) return card;
  return {
    ...card,
    value: face,
    items: card.items.map((item): StatusCardItem => {
      const text = liftTextFromStatus(item.status);
      return text ? { ...item, value: text } : item;
    }),
  };
}
