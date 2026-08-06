import type { BannerKind } from "@/lib/banners";

/**
 * Where a banner appears on the public site, and how it is drawn there.
 *
 * This is the single source of truth shared by the two admin forms, the public
 * renderer, and the admin preview.  Both `landing_banners` (editorial) and `ads`
 * (paid B2B) carry a `placement` column whose values come from here.
 */
export type BannerRenderStyle =
  "strip" | "leaderboard" | "promo-card" | "in-grid" | "sidebar" | "sticky";

export type BannerSurface = "site" | "home" | "listing" | "detail" | "blog";

export type BannerPlacement =
  | "header_strip"
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
 * Styles that draw a single creative.  When several target the same placement
 * only the first (by sort_order) is shown — the rest wait for rotation, which
 * is not built yet.  `strip` and `promo-card` stack every match instead, which
 * is what the pre-placement InfoBanners/PromoBanners did.
 */
const SINGLE_CREATIVE_STYLES: BannerRenderStyle[] = [
  "leaderboard",
  "in-grid",
  "sidebar",
  "sticky",
];

export const BANNER_PLACEMENTS: PlacementSpec[] = [
  {
    id: "header_strip",
    renderStyle: "strip",
    surface: "site",
    aspect: "—",
    description: "გამოჩნდება ყველა გვერდზე, ნავიგაციის ზემოთ",
    legacyKind: "info",
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
