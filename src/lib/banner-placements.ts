import type { BannerKind } from "@/lib/banners";

/**
 * Where a banner appears on the public site, and how it is drawn there.
 *
 * This is the single source of truth shared by the two admin forms, the public
 * renderer, and the admin preview.  Both `landing_banners` (editorial) and `ads`
 * (paid B2B) carry a `placement` column whose values come from here.
 */
export type BannerRenderStyle =
  | "strip"
  | "leaderboard"
  | "promo-card"
  | "in-grid"
  | "sidebar"
  | "sticky"
  | "mobile-strip";

export type BannerSurface = "site" | "home" | "listing" | "detail" | "blog";

export type BannerPlacement =
  | "header_strip"
  | "mobile_strip"
  | "footer_leaderboard"
  | "sticky_bottom"
  | "home_hero"
  | "home_top_strip"
  | "home_promo"
  | "home_between_sections"
  | "listing_top"
  | "listing_grid"
  | "detail_sidebar"
  | "blog_inline";

export type PlacementSpec = {
  id: BannerPlacement;
  renderStyle: BannerRenderStyle;
  surface: BannerSurface;
  /** Recommended creative ratio, surfaced in the admin form as guidance. */
  aspect: string;
  /**
   * Georgian, plain language: where this placement actually renders on the
   * live site. Surfaced as helper text under the placement <select> in both
   * admin banner forms so "სად გამოჩნდება" never requires guessing from a
   * live preview.
   */
  description: string;
  /**
   * `landing_banners.kind` is a NOT NULL enum that predates placements.  Writes
   * derive it from here so the column stays valid and a code revert still puts
   * every banner somewhere sane.  Nothing reads `kind` at render time.
   */
  legacyKind: BannerKind;
};

/**
 * Styles that draw a single creative per page view. Which one is the media
 * plan's rotation (C47, src/lib/banner-slots-client.ts:useSlotRotation): paid
 * ads by share of voice, editorial banners in the share nobody bought.
 * `strip` and `promo-card` stack every editorial match instead (what the
 * pre-placement InfoBanners/PromoBanners did) plus at most one paid ad.
 */
const SINGLE_CREATIVE_STYLES: BannerRenderStyle[] = [
  "leaderboard",
  "in-grid",
  "sidebar",
  "sticky",
  "mobile-strip",
];

export const BANNER_PLACEMENTS: PlacementSpec[] = [
  {
    id: "header_strip",
    renderStyle: "strip",
    surface: "site",
    aspect: "—",
    description: "გამოჩნდება ყველა გვერდზე, გვერდის თავში, ნავიგაციის ქვემოთ",
    legacyKind: "info",
  },
  {
    // The rate card's "მობილური — ზოლი" (C47): phones only, drawn after mount
    // when the screen is narrower than 768 px.
    id: "mobile_strip",
    renderStyle: "mobile-strip",
    surface: "site",
    aspect: "320×100",
    description:
      "მხოლოდ ტელეფონზე: ყველა გვერდზე, ნავიგაციის ქვემოთ, ეკრანის სიგანის ზოლი",
    legacyKind: "promo",
  },
  {
    id: "footer_leaderboard",
    renderStyle: "leaderboard",
    surface: "site",
    aspect: "1160×180",
    description: "გამოჩნდება ყველა გვერდზე, ფუტერის თავზე",
    legacyKind: "promo",
  },
  {
    id: "sticky_bottom",
    renderStyle: "sticky",
    surface: "site",
    aspect: "—",
    description:
      "გამოჩნდება ყველა გვერდზე, ეკრანის ბოლოში მიმაგრებული ზოლის სახით",
    legacyKind: "sticky_news",
  },
  {
    id: "home_hero",
    renderStyle: "leaderboard",
    surface: "home",
    aspect: "1160×180",
    description: "მთავარი გვერდის თავზე, დიდი ბანერი",
    legacyKind: "promo",
  },
  {
    id: "home_top_strip",
    renderStyle: "strip",
    surface: "home",
    aspect: "—",
    description: "მთავარი გვერდი, ჰედერის ქვემოთ",
    legacyKind: "info",
  },
  {
    id: "home_promo",
    renderStyle: "promo-card",
    surface: "home",
    aspect: "320×180",
    description: "მთავარი გვერდის პრომო ბლოკი",
    legacyKind: "promo",
  },
  {
    id: "home_between_sections",
    renderStyle: "promo-card",
    surface: "home",
    aspect: "320×180",
    description: "მთავარი გვერდი, კონტენტის სექციებს შორის",
    legacyKind: "promo",
  },
  {
    id: "listing_top",
    renderStyle: "leaderboard",
    surface: "listing",
    aspect: "1160×180",
    description:
      "განცხადებების გვერდებზე (ბინები, სასტუმროები, გაყიდვები, კვება და სხვ.), ბადის თავზე",
    legacyKind: "promo",
  },
  {
    id: "listing_grid",
    renderStyle: "in-grid",
    surface: "listing",
    aspect: "1×1",
    description: "იგივე გვერდები, ბადეში, განცხადებების ბარათებს შორის",
    legacyKind: "promo",
  },
  {
    id: "detail_sidebar",
    renderStyle: "sidebar",
    surface: "detail",
    aspect: "320×400",
    description:
      "დეტალურ გვერდებზე (ბინა, სასტუმრო, გაყიდვა, კვება, სამუშაო) — გვერდითი პანელი",
    legacyKind: "promo",
  },
  {
    id: "blog_inline",
    renderStyle: "promo-card",
    surface: "blog",
    aspect: "320×180",
    description: "ბლოგის სტატიის ტექსტში",
    legacyKind: "promo",
  },
];

const PLACEMENT_BY_ID = new Map<string, PlacementSpec>(
  BANNER_PLACEMENTS.map((spec) => [spec.id, spec]),
);

export const BANNER_PLACEMENT_IDS: BannerPlacement[] = BANNER_PLACEMENTS.map(
  (spec) => spec.id,
);

export function isBannerPlacement(value: unknown): value is BannerPlacement {
  return typeof value === "string" && PLACEMENT_BY_ID.has(value);
}

/**
 * Returns null rather than throwing for an unmapped value, so a row written by
 * a future migration (or by hand) can never crash a public page — the slot just
 * renders nothing.  Do not replace this with an index lookup: the sibling
 * `BANNER_TONE_STYLES[tone]` pattern crashes on any off-union value.
 */
export function getPlacementSpec(value: unknown): PlacementSpec | null {
  return typeof value === "string"
    ? (PLACEMENT_BY_ID.get(value) ?? null)
    : null;
}

export function placementsForSurface(surface: BannerSurface): PlacementSpec[] {
  return BANNER_PLACEMENTS.filter((spec) => spec.surface === surface);
}

export function rendersSingleCreative(style: BannerRenderStyle): boolean {
  return SINGLE_CREATIVE_STYLES.includes(style);
}

/**
 * Styles that draw nothing without an image or a video. `strip`, `sticky` and
 * `promo-card` are text-driven and render fine without media.
 */
const MEDIA_FIRST_STYLES: BannerRenderStyle[] = [
  "leaderboard",
  "sidebar",
  "in-grid",
  "mobile-strip",
];

export function placementRequiresMedia(placement: unknown): boolean {
  const spec = getPlacementSpec(placement);
  return spec != null && MEDIA_FIRST_STYLES.includes(spec.renderStyle);
}

/**
 * The fields that decide whether a creative reaches visitors. Structural on
 * purpose (BannerCreative satisfies it) so this module stays free of runtime
 * imports and scripts/unit can load it bare.
 */
export type SlotCandidate = {
  id: string;
  placement: string;
  sortOrder: number;
  sponsored: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  /** Ads only (C47): the booked share of voice; missing = the whole slot. */
  sovPercent?: number | null;
};

/**
 * C47: the sponsored grid card is sold by rotation and a listing page shows up
 * to two of them (src/lib/ad-rotation.ts ROTATION_PLACEMENTS and
 * MAX_SPONSORED_PER_PAGE; scripts/unit/ad-rotation.test.mjs keeps them equal).
 * Repeated here because this module must stay free of runtime imports.
 */
const ROTATION_SLOT_PLACEMENTS: Record<string, number> = { listing_grid: 2 };

function instant(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function isInSchedule(c: SlotCandidate, now: number): boolean {
  const start = instant(c.startAt);
  const end = instant(c.endAt);
  return (start == null || start <= now) && (end == null || end >= now);
}

/**
 * Render order inside a placement: sort order, then paid ahead of editorial
 * (ads are all sortOrder 0, so an editorial banner would otherwise win a
 * single-creative slot against a paid ad), then newest first, then id so the
 * order never depends on how the database happened to return the rows.
 */
export function compareSlotCandidates(
  a: SlotCandidate,
  b: SlotCandidate,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
  const ca = instant(a.createdAt) ?? 0;
  const cb = instant(b.createdAt) ?? 0;
  if (ca !== cb) return cb - ca;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * What visitors get, in render order: enabled creatives (the caller has
 * already dropped disabled banners and paused ads) that are inside their
 * schedule, sit on a known placement, and have media where the placement
 * needs it. The public loader and both admin pages call this, so the admin's
 * "shown / not shown" can never disagree with the site.
 */
export function selectLiveCreatives<T extends SlotCandidate>(
  creatives: T[],
  now: number,
): T[] {
  return creatives
    .filter(
      (c) =>
        getPlacementSpec(c.placement) != null &&
        isInSchedule(c, now) &&
        (!placementRequiresMedia(c.placement) ||
          c.imageUrl != null ||
          c.videoUrl != null),
    )
    .sort(compareSlotCandidates);
}

export type SlotState =
  "live" | "scheduled" | "expired" | "needs_media" | "hidden";

/**
 * Why an enabled creative is or is not on the site. `live` is
 * selectLiveCreatives() over every enabled creative of both tables. In a
 * single-creative placement every paid ad is `live`: it rotates by its share
 * of voice (C47). An editorial banner there is house fill — `hidden` when the
 * live ads already book the whole slot, or when another banner is ahead of it.
 */
export function slotState(
  c: SlotCandidate,
  live: SlotCandidate[],
  now: number,
): SlotState {
  const start = instant(c.startAt);
  const end = instant(c.endAt);
  if (end != null && end < now) return "expired";
  if (start != null && start > now) return "scheduled";
  if (placementRequiresMedia(c.placement) && !c.imageUrl && !c.videoUrl) {
    return "needs_media";
  }
  const spec = getPlacementSpec(c.placement);
  if (spec && rendersSingleCreative(spec.renderStyle) && !c.sponsored) {
    const { housePositions, house } = slotFill(c.placement, live);
    const rank = house.findIndex((x) => x.id === c.id);
    if (rank === -1 || rank >= housePositions) return "hidden";
  }
  return "live";
}

/**
 * A single-creative placement's live creatives: the paid ads, the editorial
 * banners in order, and how many of those banners can show — the unsold share
 * of a SOV slot (none once the ads book 100 %), or the grid card's positions
 * the booked ads leave free.
 */
function slotFill<T extends SlotCandidate>(placement: string, live: T[]) {
  const inSlot = live.filter((x) => x.placement === placement);
  const ads = inSlot.filter((x) => x.sponsored);
  const rotationPositions = ROTATION_SLOT_PLACEMENTS[placement];
  const housePositions =
    rotationPositions !== undefined
      ? Math.max(0, rotationPositions - ads.length)
      : ads.reduce((sum, ad) => sum + (ad.sovPercent ?? 100), 0) >= 100
        ? 0
        : 1;
  return { ads, house: inSlot.filter((x) => !x.sponsored), housePositions };
}

/**
 * What keeps an editorial banner out of a single-creative placement, for the
 * "hidden" hint: the first live ad when the ads leave no room, else the
 * editorial banner ahead of it.
 */
export function slotHolder<T extends SlotCandidate>(
  placement: string,
  live: T[],
): T | null {
  const { ads, house, housePositions } = slotFill(placement, live);
  return (housePositions === 0 ? ads[0] : house[0]) ?? null;
}

/** `landing_banners.kind` value to write alongside a given placement. */
export function legacyKindForPlacement(placement: BannerPlacement): BannerKind {
  return PLACEMENT_BY_ID.get(placement)?.legacyKind ?? "promo";
}

/**
 * `ads.position` value to write alongside a given placement. The column is
 * still NOT NULL and predates placements; nothing reads it, but keeping it
 * populated and coherent is what makes a code revert safe.
 */
export function legacyPositionForPlacement(
  placement: BannerPlacement,
): "slot-a" | "slot-b" | "slot-c" {
  switch (placement) {
    case "listing_grid":
      return "slot-b";
    case "detail_sidebar":
      return "slot-c";
    default:
      return "slot-a";
  }
}
