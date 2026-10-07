/**
 * Ad rotation (contract C47): which creative a banner slot shows on one page
 * view, per the owner's media plan ("MyBakuriani_Advertising_Media_Plan_Rate_
 * Card_v1.0", §1, §4 and §7).
 *
 * Pure on purpose (no `@/` imports) so scripts/unit/ad-rotation.test.mjs can
 * import it bare and simulate thousands of page views.
 *
 *  - Share of Voice: an ad booked at 25 % is drawn on about a quarter of the
 *    slot's page views, 50 % on half, 100 % on every one (and the database
 *    refuses any other ad that would overlap a 100 % booking, see
 *    `ads_enforce_slot_capacity`). Shares are NOT normalised: the part of the
 *    slot nobody bought goes to the placement's editorial banners (house fill)
 *    or the slot stays empty, so "Exclusive" keeps its meaning.
 *  - Priority (1–10, higher first) orders the ads before the draw, so if a slot
 *    is ever oversold the lowest-priority share is the one squeezed out.
 *  - Frequency cap: an ad this device already saw `frequencyCap` times today is
 *    skipped, and its share falls to the house fill for this device.
 *  - Rotation placements (the sponsored card between listings) have no unsold
 *    share: the booked ads split every sponsored position by weight.
 */

export type RotationCandidate = {
  id: string;
  /** Paid ad (true) or editorial banner (house fill). */
  sponsored: boolean;
  /** Ads only: 25 | 50 | 100. Ignored for editorial banners. */
  sovPercent: number;
  /** Ads only: 1–10, higher is served first. */
  priority: number;
  /** Ads only: impressions per device per day; null = no cap. */
  frequencyCap: number | null;
};

export type RotationMode = "sov" | "rotation";

/** SOV tiers the rate card sells (§1: 25 % / 50 % / 100 %). */
export const SOV_TIERS = [25, 50, 100] as const;
export type SovTier = (typeof SOV_TIERS)[number];
export const DEFAULT_SOV: SovTier = 25;

export const AD_PRIORITY_MIN = 1;
export const AD_PRIORITY_MAX = 10;
export const DEFAULT_AD_PRIORITY = 5;

/** §4 "Mobile": one ad's frequency cap — 3 impressions a day. */
export const DEFAULT_FREQUENCY_CAP = 3;
export const FREQUENCY_CAP_MAX = 50;

/** Placements sold "by rotation" (§2: "კატალოგი — ბარათებს შორის"). */
export const ROTATION_PLACEMENTS: readonly string[] = ["listing_grid"];

/** §4 "Sponsored card": one in every 8–10 organic listings, at most 2 a page. */
export const SPONSORED_EVERY = 8;
export const MAX_SPONSORED_PER_PAGE = 2;

/** §4 "320×400": refresh no sooner than 30–45 s (the conservative end). */
export const SIDEBAR_REFRESH_MS = 45_000;

/** §4 "Mobile": at most 2 paid placements in one screen flow (page view). */
export const MOBILE_MAX_AD_PLACEMENTS = 2;
/** Phones = below the site's `md` breakpoint (768 px). */
export const MOBILE_MAX_WIDTH_PX = 767;
/** Placements drawn only on phones (§2 "მობილური — ზოლი"). */
export const PHONE_ONLY_PLACEMENTS: readonly string[] = ["mobile_strip"];

export function rotationModeFor(placement: string): RotationMode {
  return ROTATION_PLACEMENTS.includes(placement) ? "rotation" : "sov";
}

export function isSovTier(value: unknown): value is SovTier {
  return (
    typeof value === "number" &&
    (SOV_TIERS as readonly number[]).includes(value)
  );
}

export function isAdPriority(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= AD_PRIORITY_MIN &&
    value <= AD_PRIORITY_MAX
  );
}

/** null = no cap; otherwise a whole number 1–FREQUENCY_CAP_MAX. */
export function isFrequencyCap(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= FREQUENCY_CAP_MAX)
  );
}

/** The campaign columns of an `ads` row (§7), as the admin routes write them. */
export type CampaignFields = {
  sov_percent?: SovTier;
  priority?: number;
  frequency_cap_per_day?: number | null;
};

export type CampaignFieldsError =
  "invalid_sov" | "invalid_priority" | "invalid_frequency_cap";

/**
 * Reads `sov_percent`, `priority` and `frequency_cap_per_day` from an admin
 * request body. On create (`partial: false`) a missing field takes its default
 * (25 %, priority 5, cap 3 a day); on update only the fields sent are written.
 * `frequency_cap_per_day: null` means no cap.
 */
export function parseCampaignFields(
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
):
  | { ok: true; fields: CampaignFields }
  | { ok: false; error: CampaignFieldsError } {
  const fields: CampaignFields = {};

  if ("sov_percent" in body) {
    if (!isSovTier(body.sov_percent))
      return { ok: false, error: "invalid_sov" };
    fields.sov_percent = body.sov_percent;
  } else if (!partial) {
    fields.sov_percent = DEFAULT_SOV;
  }

  if ("priority" in body) {
    if (!isAdPriority(body.priority)) {
      return { ok: false, error: "invalid_priority" };
    }
    fields.priority = body.priority;
  } else if (!partial) {
    fields.priority = DEFAULT_AD_PRIORITY;
  }

  if ("frequency_cap_per_day" in body) {
    if (!isFrequencyCap(body.frequency_cap_per_day)) {
      return { ok: false, error: "invalid_frequency_cap" };
    }
    fields.frequency_cap_per_day = body.frequency_cap_per_day;
  } else if (!partial) {
    fields.frequency_cap_per_day = DEFAULT_FREQUENCY_CAP;
  }

  return { ok: true, fields };
}

/** SQLSTATE of `ads_enforce_slot_capacity`; its `detail` is the free share. */
export const SLOT_FULL_SQLSTATE = "MBSOV";

function share(candidate: RotationCandidate): number {
  const value = Number(candidate.sovPercent);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 100);
}

/** Priority high → low, then the bigger share, then id (stable across renders). */
export function orderAds<T extends RotationCandidate>(ads: readonly T[]): T[] {
  return [...ads].sort(
    (a, b) =>
      (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
      share(b) - share(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export type PickOptions = {
  /** One draw in [0, 1) per page view (or per sidebar refresh). */
  random: number;
  /** Ads this device has already seen `frequencyCap` times today. */
  capped?: ReadonlySet<string>;
  /** False when a phone page already shows its two paid placements. */
  adsAllowed?: boolean;
  /** Creatives already shown at another position of this page. */
  exclude?: ReadonlySet<string>;
};

/**
 * The one paid ad a slot shows on this page view, or null for the share nobody
 * bought (or when ads are not allowed here).
 */
export function pickAd<T extends RotationCandidate>(
  candidates: readonly T[],
  mode: RotationMode,
  { random, capped, adsAllowed = true, exclude }: PickOptions,
): T | null {
  if (!adsAllowed) return null;
  const ads = orderAds(
    candidates.filter(
      (c) =>
        c.sponsored &&
        share(c) > 0 &&
        !capped?.has(c.id) &&
        !exclude?.has(c.id),
    ),
  );
  if (ads.length === 0) return null;
  const r = Math.min(Math.max(Number(random) || 0, 0), 0.999999999);

  if (mode === "rotation") {
    const total = ads.reduce((sum, ad) => sum + share(ad), 0);
    let acc = 0;
    for (const ad of ads) {
      acc += share(ad);
      if (r * total < acc) return ad;
    }
    return ads[ads.length - 1];
  }

  // §7: 100 % SOV excludes every other ad in the slot.
  const exclusive = ads.find((ad) => share(ad) >= 100);
  if (exclusive) return exclusive;

  let acc = 0;
  for (const ad of ads) {
    acc += share(ad);
    if (r * 100 < acc) return ad;
  }
  return null;
}

/** First editorial banner (the server orders them by sort_order). */
export function pickHouse<T extends RotationCandidate>(
  candidates: readonly T[],
  exclude?: ReadonlySet<string>,
): T | null {
  return candidates.find((c) => !c.sponsored && !exclude?.has(c.id)) ?? null;
}

/** A single-creative slot: the drawn ad, else house fill, else nothing. */
export function pickSlot<T extends RotationCandidate>(
  candidates: readonly T[],
  mode: RotationMode,
  options: PickOptions,
): T | null {
  return (
    pickAd(candidates, mode, options) ?? pickHouse(candidates, options.exclude)
  );
}

/**
 * Stacked styles (strip, promo card) keep every editorial banner and add at
 * most ONE paid ad per page view (§4 "320×180: one per pageview"), first.
 */
export function stackSlot<T extends RotationCandidate>(
  candidates: readonly T[],
  ad: T | null,
): T[] {
  const house = candidates.filter((c) => !c.sponsored);
  return ad ? [ad, ...house] : house;
}

/** True when the slot has nothing to draw: no paid ad among the candidates. */
export function isDeterministic(
  candidates: readonly RotationCandidate[],
): boolean {
  return !candidates.some((c) => c.sponsored);
}

/**
 * Where the sponsored cards go in a grid of `organicCount` listings: after
 * every SPONSORED_EVERY-th organic card, at most MAX_SPONSORED_PER_PAGE. A
 * page with fewer than SPONSORED_EVERY listings (but at least one) gets one
 * card after its last listing (the owner's call, 2026-10-06), so the 6-card
 * sales pages and small categories still deliver.
 *
 * Returns organic counts: [8] means "after the 8th listing".
 */
export function sponsoredGridPositions(organicCount: number): number[] {
  const count = Math.max(0, Math.floor(Number(organicCount) || 0));
  if (count === 0) return [];
  if (count < SPONSORED_EVERY) return [count];
  const positions: number[] = [];
  for (
    let after = SPONSORED_EVERY;
    after <= count && positions.length < MAX_SPONSORED_PER_PAGE;
    after += SPONSORED_EVERY
  ) {
    positions.push(after);
  }
  return positions;
}

/**
 * Interleaves sponsored slots into a list of rendered cards. `makeSlot(i)` is
 * called once per sponsored position (i = 0, 1) and its result is inserted
 * right after the card that ends that run of organic listings.
 */
export function interleaveSponsored<N>(
  cards: readonly N[],
  makeSlot: (index: number) => N,
): N[] {
  const positions = sponsoredGridPositions(cards.length);
  const out: N[] = [];
  cards.forEach((card, i) => {
    out.push(card);
    const slotIndex = positions.indexOf(i + 1);
    if (slotIndex !== -1) out.push(makeSlot(slotIndex));
  });
  return out;
}
