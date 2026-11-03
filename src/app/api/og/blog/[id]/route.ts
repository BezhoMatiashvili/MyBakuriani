import { renderableImageUrl } from "@/lib/banner-creative";
import { createPublicClient } from "@/lib/supabase/server";
import { blogOgCardUrl } from "@/lib/utils/listingUrls";
import { isUuid } from "@/lib/utils/uuid";

// sharp is a native module: Node runtime.
export const runtime = "nodejs";

/** Facebook's large-card size; src/lib/seo.ts declares it for this card. */
const WIDTH = 1200;
const HEIGHT = 630;

/** Comfortably under the ~300 KB past which WhatsApp drops the preview image. */
const MAX_CARD_BYTES = 280_000;

/** The branded 1200x630 picture in /public, for a cover that cannot be used. */
const FALLBACK_IMAGE = "/og-default.png";

const SHORT_CACHE = "public, max-age=300, s-maxage=300";

/**
 * The share card of a blog post (C40): its cover cropped to 1200x630 as a
 * JPEG, with nothing drawn on it. The post page names it as its first
 * og:image with that size, so Facebook draws the large photo card (then
 * MYBAKURIANI.GE and the title) from the first share, and WhatsApp and
 * Telegram, which read only the first og:image, get a small JPEG instead of
 * the edge's WebP copy of the cover.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  // Published posts only, read as the page reads them (anon client).
  const { data: post, error } = await createPublicClient()
    .from("blog_posts")
    .select("image_url")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  // A failed read is retried later, never cached as the post's picture.
  if (error) {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
  if (!post) return new Response("Not found", { status: 404 });
  if (!post.image_url) return fallback();

  // One URL per cover. Any other spelling (case, query, a replaced cover's
  // token) 308s to the current one, so a made-up query never renders a card;
  // the redirect is cached briefly because the token follows the cover.
  const canonical = blogOgCardUrl(id, post.image_url);
  const url = new URL(request.url);
  if (url.pathname + url.search !== canonical) {
    return new Response(null, {
      status: 308,
      headers: { Location: canonical, "Cache-Control": SHORT_CACHE },
    });
  }

  const cover = await loadCover(post.image_url);
  const card = cover && (await encodeCard(cover));
  if (!card) return fallback();
  return new Response(new Uint8Array(card), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(card.byteLength),
      "Cache-Control":
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800",
    },
  });
}

/** The branded picture, cached briefly so a fixed cover shows up soon. */
function fallback(): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: FALLBACK_IMAGE, "Cache-Control": SHORT_CACHE },
  });
}

/**
 * The cover's bytes, or null. image_url is admin-written, so, as for the
 * listing card, only the hosts the site renders images from are fetched
 * (renderableImageUrl), with no redirect that could hop off them (SSRF).
 */
async function loadCover(value: string): Promise<Buffer | null> {
  const safe = renderableImageUrl(value);
  if (!safe) return null;
  try {
    const res = await fetch(safe, {
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // A pathological upload must not eat the container's memory.
    return buf.byteLength > 6_000_000 ? null : buf;
  } catch {
    return null;
  }
}

/**
 * The cover cropped to the card size: upright (EXIF), on white where it is
 * transparent, centred, as a JPEG whose quality steps down until it fits
 * MAX_CARD_BYTES. Null when sharp cannot read it.
 */
async function encodeCard(cover: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    let jpeg: Buffer | null = null;
    for (const quality of [80, 70, 60, 50]) {
      jpeg = await sharp(cover)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(WIDTH, HEIGHT, { fit: "cover" })
        .jpeg({ quality })
        .toBuffer();
      if (jpeg.byteLength <= MAX_CARD_BYTES) break;
    }
    return jpeg;
  } catch {
    return null;
  }
}
