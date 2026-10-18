// Share targets for a listing detail page (src/components/shared/ShareMenu.tsx).
// Deliberately pure and free of `@/` imports so `scripts/unit/*.test.mjs` can
// import this module directly under `node --test` type-stripping (see C29).

/**
 * The URL a share hands out: origin + path only. The query is dropped because
 * on the owner-preview route it is `?preview=1`, which middleware turns into
 * the force-dynamic, noindex /preview twin (C28) — never a link to give out.
 */
export function shareableUrl(location: {
  origin: string;
  pathname: string;
}): string {
  return `${location.origin}${location.pathname}`;
}

/**
 * Facebook's composer renders the preview card purely from the page's Open
 * Graph tags (src/lib/seo.ts); the sharer ignores any text passed to it.
 */
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * URL only: WhatsApp builds the preview (image, title, domain) from the same
 * Open Graph tags, so a title in front of it would only repeat the card.
 */
export function whatsappShareUrl(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}
