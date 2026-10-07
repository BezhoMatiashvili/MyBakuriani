/**
 * The advertising rate card (contract C47): the owner's media plan
 * "MyBakuriani_Advertising_Media_Plan_Rate_Card_v1.0" §2 (slots and prices)
 * and §5 (ready packages), every price for 30 days in GEL.
 *
 * Admin-only on purpose (the owner's call, 2026-10-06): the ads form shows the
 * price for the chosen placement + SOV, and the ads page shows the whole card.
 * Nothing public reads it. Ads are sold by hand, so nothing charges from it.
 *
 * Pure (no `@/` imports): scripts/unit/ad-rotation.test.mjs checks that every
 * placement here is a real placement and every SOV a sold tier.
 */

export const RATE_CARD_VERSION = "v1.0";
export const RATE_CARD_DAYS = 30;

export type RateCardTier =
  "standard" | "premium" | "premium_plus" | "exclusive";

export type RateCardSlot = {
  placement: string;
  /** Creative size as the card prints it. */
  format: string;
  tier: RateCardTier;
  /** null = sold "by rotation" (no share of voice). */
  sov: 25 | 50 | 100 | null;
  priceGel: number;
};

/** §2 "სარეკლამო ადგილები და ფასები", in the card's order. */
export const RATE_CARD_SLOTS: readonly RateCardSlot[] = [
  {
    placement: "home_hero",
    format: "1160×180",
    tier: "premium",
    sov: 25,
    priceGel: 250,
  },
  {
    placement: "home_hero",
    format: "1160×180",
    tier: "premium_plus",
    sov: 50,
    priceGel: 450,
  },
  {
    placement: "home_hero",
    format: "1160×180",
    tier: "exclusive",
    sov: 100,
    priceGel: 750,
  },
  {
    placement: "listing_top",
    format: "1160×180",
    tier: "standard",
    sov: 25,
    priceGel: 180,
  },
  {
    placement: "listing_top",
    format: "1160×180",
    tier: "premium",
    sov: 50,
    priceGel: 320,
  },
  {
    placement: "listing_top",
    format: "1160×180",
    tier: "exclusive",
    sov: 100,
    priceGel: 550,
  },
  {
    placement: "home_promo",
    format: "320×180",
    tier: "standard",
    sov: 25,
    priceGel: 120,
  },
  {
    placement: "home_promo",
    format: "320×180",
    tier: "premium",
    sov: 50,
    priceGel: 210,
  },
  {
    placement: "listing_grid",
    format: "1×1 / Sponsored",
    tier: "standard",
    sov: null,
    priceGel: 90,
  },
  {
    placement: "detail_sidebar",
    format: "320×400",
    tier: "standard",
    sov: 25,
    priceGel: 150,
  },
  {
    placement: "detail_sidebar",
    format: "320×400",
    tier: "premium",
    sov: 50,
    priceGel: 270,
  },
  {
    placement: "mobile_strip",
    format: "Responsive",
    tier: "standard",
    sov: 25,
    priceGel: 100,
  },
  {
    placement: "blog_inline",
    format: "320×180",
    tier: "standard",
    sov: 25,
    priceGel: 80,
  },
];

export type RateCardPackageItem =
  | { placement: string; sov: 25 | 50 | 100 | null }
  /** §5 SEASON TAKEOVER: "შესაბამისი Native placement". */
  | { native: true };

export type RateCardPackage = {
  code: "start" | "growth" | "premium" | "dominance" | "season_takeover";
  /** Printed as-is: the card names packages in Latin capitals. */
  name: string;
  items: readonly RateCardPackageItem[];
  priceGel: number;
};

/** §5 "მზა პაკეტები". */
export const RATE_CARD_PACKAGES: readonly RateCardPackage[] = [
  {
    code: "start",
    name: "START",
    items: [
      { placement: "home_promo", sov: 25 },
      { placement: "mobile_strip", sov: 25 },
    ],
    priceGel: 180,
  },
  {
    code: "growth",
    name: "GROWTH",
    items: [
      { placement: "listing_top", sov: 25 },
      { placement: "detail_sidebar", sov: 25 },
    ],
    priceGel: 300,
  },
  {
    code: "premium",
    name: "PREMIUM",
    items: [
      { placement: "home_hero", sov: 50 },
      { placement: "listing_top", sov: 25 },
    ],
    priceGel: 550,
  },
  {
    code: "dominance",
    name: "DOMINANCE",
    items: [
      { placement: "home_hero", sov: 100 },
      { placement: "listing_top", sov: 50 },
      { placement: "mobile_strip", sov: 50 },
    ],
    priceGel: 1050,
  },
  {
    code: "season_takeover",
    name: "SEASON TAKEOVER",
    items: [
      { placement: "home_hero", sov: null },
      { placement: "listing_top", sov: null },
      { placement: "mobile_strip", sov: null },
      { native: true },
    ],
    priceGel: 1500,
  },
];

/** The card's price for one placement at one SOV (rotation slots ignore SOV). */
export function rateCardSlot(
  placement: string,
  sov: number | null,
): RateCardSlot | null {
  return (
    RATE_CARD_SLOTS.find(
      (slot) =>
        slot.placement === placement &&
        (slot.sov === null ? true : slot.sov === sov),
    ) ?? null
  );
}
