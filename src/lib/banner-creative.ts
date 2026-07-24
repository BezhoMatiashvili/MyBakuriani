import {
  BANNER_TONE_STYLES,
  isBannerTone,
  type BannerTone,
} from "@/lib/banners";
import {
  getPlacementSpec,
  legacyKindForPlacement,
  type BannerPlacement,
} from "@/lib/banner-placements";
import { safeHttpsUrl, safeInternalPath } from "@/lib/security";

/**
 * The one shape the public renderer draws.  `landing_banners` (editorial) and
 * `ads` (paid B2B) are different tables with different columns; both normalize
 * into this before anything renders them.
 *
 * Isomorphic on purpose — the API route and the admin live preview both build
 * creatives through these adapters, so the preview cannot drift from production.
 */
export type BannerCreativeSource = "banner" | "ad";

export type BannerCreative = {
  /** `${source}:${rowId}` — unique across both tables, safe as a React key. */
  id: string;
  /** Raw row id, for impression/click tracking. */
  sourceId: string;
  source: BannerCreativeSource;
  placement: BannerPlacement;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  /** Sanitized internal path or https URL. */
  href: string | null;
  /** href points off-site → needs target/rel treatment. */
  external: boolean;
  /** Renderable by next/image by construction (see renderableImageUrl). */
  imageUrl: string | null;
  /** Renderable by <video> under the CSP by construction. */
  videoUrl: string | null;
  videoPosterUrl: string | null;
  tone: BannerTone;
  /** True for every ad-sourced creative — drives the advertising disclosure. */
  sponsored: boolean;
  sortOrder: number;
  /** Shown in the editorial detail modal's schedule row. */
  startAt: string | null;
  endAt: string | null;
};

const VIDEO_URL_RE = /\.(mp4|webm)(\?|#|$)/i;
const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

export function looksLikeVideoUrl(url: string): boolean {
  return VIDEO_URL_RE.test(url);
}

/**
 * Write-boundary guard for an ad's creative.
 *
 * The old admin form bound the media uploader AND a free-text "banner URL" box
 * to the same field, so admins pasted the click-through page URL into it and
 * three live rows ended up with a page URL where an image belonged. A creative
 * must therefore either be an uploaded storage object or carry a real media
 * extension — a bare page URL is rejected.
 */
export function isCreativeMediaUrl(value: unknown): boolean {
  const safe = safeHttpsUrl(value);
  if (!safe) return false;
  if (renderableVideoUrl(safe) && VIDEO_URL_RE.test(safe)) return true;
  if (IMAGE_URL_RE.test(safe)) return renderableImageUrl(safe) != null;
  // Storage objects are ours and may legitimately lack an extension in the
  // path; anything else must look like media.
  try {
    const url = new URL(safe);
    return (
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

/**
 * A URL we can actually put in front of a user.
 *
 * This is the INTERSECTION of two independent allow-lists, and both must hold:
 *   - CSP `img-src` in src/middleware.ts:21 — 'self', data:, blob:,
 *     *.supabase.co, images.unsplash.com, *.basemaps.cartocdn.com
 *   - next/image `remotePatterns` in next.config.ts — *.supabase.co restricted
 *     to pathname /storage/v1/object/public/**, plus images.unsplash.com
 *
 * Note this is deliberately NOT `safeStorageImageUrl` from @/lib/security: that
 * helper also accepts /storage/v1/object/sign/ URLs, which pass the CSP but are
 * rejected by next/image's remotePatterns — they'd survive validation and then
 * throw at render time.
 */
export function renderableImageUrl(value: unknown): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    if (url.hostname === "images.unsplash.com") return safe;
    if (
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/")
    ) {
      return safe;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Strictly narrower than renderableImageUrl: CSP `media-src` (middleware.ts:24)
 * is only 'self' + *.supabase.co — unsplash is NOT allowed for media.
 */
export function renderableVideoUrl(value: unknown): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    return url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/")
      ? safe
      : null;
  } catch {
    return null;
  }
}

/**
 * Tone lookup that cannot crash.  `landing_banners.tone` is plain `text` with no
 * CHECK constraint, so an off-union value is reachable from a hand-written row —
 * and `BANNER_TONE_STYLES[tone]` would return undefined and throw on `.bg`.
 */
export const DEFAULT_AD_TONE: BannerTone = "slate";

export function getTonePalette(tone: unknown) {
  return isBannerTone(tone)
    ? BANNER_TONE_STYLES[tone]
    : BANNER_TONE_STYLES[DEFAULT_AD_TONE];
}

function safeTone(tone: unknown): BannerTone {
  return isBannerTone(tone) ? tone : DEFAULT_AD_TONE;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Only the columns the adapter actually reads — deliberately NOT
 * `Omit<LandingBanner, …>`, so callers can pass the narrow explicit projection
 * the API route selects without having to fetch `active`/`created_at`/etc.
 */
type LandingBannerRow = {
  id: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_url: string | null;
  video_url: string | null;
  video_poster_url: string | null;
  tone: string;
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  kind?: string;
  placement?: string | null;
};

/**
 * Falls back to deriving the placement from `kind` so the adapter also works
 * against a row written before the placement backfill.
 */
function resolveBannerPlacement(row: {
  placement?: string | null;
  kind?: string;
}): BannerPlacement | null {
  const direct = getPlacementSpec(row.placement);
  if (direct) return direct.id;
  switch (row.kind) {
    case "info":
      return "home_top_strip";
    case "promo":
      return "home_promo";
    case "sticky_news":
      return "sticky_bottom";
    default:
      return null;
  }
}

export function landingBannerToCreative(
  row: LandingBannerRow,
): BannerCreative | null {
  const placement = resolveBannerPlacement(row);
  if (!placement) return null;

  const href =
    safeInternalPath(row.cta_href) ?? safeHttpsUrl(row.cta_href) ?? null;

  return {
    id: `banner:${row.id}`,
    sourceId: row.id,
    source: "banner",
    placement,
    title: row.title,
    body: trimmedOrNull(row.body),
    ctaLabel: trimmedOrNull(row.cta_label),
    href,
    external: href != null && !href.startsWith("/"),
    imageUrl: renderableImageUrl(row.image_url),
    videoUrl: renderableVideoUrl(row.video_url),
    videoPosterUrl: renderableImageUrl(row.video_poster_url),
    tone: safeTone(row.tone),
    sponsored: false,
    sortOrder: row.sort_order ?? 0,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
  };
}

type AdRow = {
  id: string;
  title: string;
  url: string;
  banner_url: string | null;
  placement?: string | null;
  position?: string | null;
  start_at?: string | null;
  end_at?: string | null;
};

function resolveAdPlacement(row: AdRow): BannerPlacement | null {
  const direct = getPlacementSpec(row.placement);
  if (direct) return direct.id;
  switch (row.position) {
    case "slot-a":
      return "home_hero";
    case "slot-b":
      return "listing_grid";
    case "slot-c":
      return "detail_sidebar";
    default:
      return null;
  }
}

/**
 * An ad is a single clickable surface, not a card with a separate CTA button:
 * `ads.url` is NOT NULL and is the whole creative's click target, so there is no
 * `ctaLabel`.  Ads carry no tone column and deliberately don't get one — the
 * tone palette is the site's own editorial voice, and neutral slate is the
 * honest presentation for third-party content.
 */
export function adRowToCreative(row: AdRow): BannerCreative | null {
  const placement = resolveAdPlacement(row);
  if (!placement) return null;

  const banner = row.banner_url;
  const isVideo = typeof banner === "string" && looksLikeVideoUrl(banner);

  return {
    id: `ad:${row.id}`,
    sourceId: row.id,
    source: "ad",
    placement,
    title: row.title,
    body: null,
    ctaLabel: null,
    href: safeHttpsUrl(row.url),
    external: true,
    imageUrl: isVideo ? null : renderableImageUrl(banner),
    videoUrl: isVideo ? renderableVideoUrl(banner) : null,
    videoPosterUrl: null,
    tone: DEFAULT_AD_TONE,
    sponsored: true,
    sortOrder: 0,
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
  };
}

export function creativeHasMedia(creative: BannerCreative): boolean {
  return creative.imageUrl != null || creative.videoUrl != null;
}

/** Re-exported so admin write paths keep `landing_banners.kind` valid. */
export { legacyKindForPlacement };

/**
 * Advertising disclosure.  A literal map rather than a message namespace on
 * purpose: `scripts/i18n-scope.mjs` decides what must be listed in
 * PUBLIC_NAMESPACES by scanning source text for the next-intl message hooks, so
 * keeping this label out of the catalogs means the public banner renderer adds
 * no namespace to the client bundle.
 *
 * NB: that scan is a plain regex over the whole file, comments included — do not
 * write those hook names followed by an open paren anywhere in this file, or the
 * `prebuild` guard will report a false positive and abort the bundle split.
 */
export const SPONSORED_LABEL: Record<string, string> = {
  ka: "რეკლამა",
  en: "Advertisement",
  ru: "Реклама",
};

export function sponsoredLabel(locale: string): string {
  return SPONSORED_LABEL[locale] ?? SPONSORED_LABEL.ka;
}
