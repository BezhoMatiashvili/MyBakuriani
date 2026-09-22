import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  getCachedPublicProperty,
  getCachedPublicService,
} from "@/lib/data/getCachedPublicListing";
import { isUuid } from "@/lib/utils/uuid";
// applyDiscount is a no-op when the discount is inactive/expired, so it alone
// satisfies C10 ("every price surface applies the shared helper").
import { applyDiscount } from "@/lib/utils/pricing";

// ImageResponse (satori + resvg-wasm) needs the Node runtime: it reads the
// vendored font off disk and holds a WASM heap per render.
export const runtime = "nodejs";

const LANDSCAPE = { width: 1200, height: 630 };
const STORY = { width: 1080, height: 1920 };

/** Brand tokens, kept literal — this file renders outside Tailwind. */
const INK = "#0F172A";
const MUTED = "#CBD5E1";
const ACCENT = "#2563EB";

// The vendored TTFs cover Georgian + Latin + digits + punctuation + the GEL
// sign (U+20BE, verified present) — but NOT Cyrillic. That is why this card
// renders only DB content (Georgian listing text) and numerals, and carries no
// localized UI labels: a Russian word here would render as silent tofu boxes.
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
let fontsPromise: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts() {
  fontsPromise ??= (async () => ({
    regular: await readFile(path.join(FONT_DIR, "NotoSansGeorgian-Regular.ttf")),
    bold: await readFile(path.join(FONT_DIR, "NotoSansGeorgian-Bold.ttf")),
  }))();
  return fontsPromise;
}

/**
 * Fetches the cover photo ourselves rather than letting satori resolve the
 * <img>, so a slow or dead Storage object degrades to the gradient card instead
 * of failing the whole render. A 500 here would mean every share of that
 * listing loses its image — strictly worse than a branded card with no photo.
 */
async function loadCover(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Guard against a pathological upload eating the container's memory.
    if (buf.byteLength > 6_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const gel = (n: number) => `${Math.round(n).toLocaleString("en-US")} ₾`;

type Card = {
  title: string;
  price: string | null;
  location: string | null;
  cover: string | null;
};

function cacheHeaders(seconds: number) {
  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=604800`,
  };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await ctx.params;
  if ((kind !== "property" && kind !== "service") || !isUuid(id)) {
    return new Response("Not found", { status: 404 });
  }

  const story = new URL(request.url).searchParams.get("format") === "story";
  const size = story ? STORY : LANDSCAPE;

  let card: Card | null = null;
  try {
    if (kind === "property") {
      const row = await getCachedPublicProperty(id);
      if (row) {
        const base = row.is_for_sale ? row.sale_price : row.price_per_night;
        const net =
          typeof base === "number"
            ? applyDiscount(base, row.discount_percent, row.discount_expires_at)
            : null;
        card = {
          title: row.title,
          price: net == null ? null : row.is_for_sale ? gel(net) : `${gel(net)} / ღამე`,
          location: row.location ?? null,
          cover: await loadCover(row.photos?.[0]),
        };
      }
    } else {
      const row = await getCachedPublicService(id);
      if (row) {
        const net =
          typeof row.price === "number"
            ? applyDiscount(row.price, row.discount_percent, row.discount_expires_at)
            : null;
        card = {
          title: row.title,
          price: net == null ? null : gel(net),
          location: row.location ?? null,
          cover: await loadCover(row.photos?.[0]),
        };
      }
    }
  } catch {
    // A transient DB failure must not 500 the crawler — fall through to the
    // branded fallback below, cached only briefly so it self-heals.
    card = null;
  }

  const { regular, bold } = await loadFonts();
  const fonts = [
    { name: "NotoGe", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "NotoGe", data: bold, weight: 700 as const, style: "normal" as const },
  ];

  // A well-formed id with no publicly-visible row (pending listing, or the
  // /preview twins' cookie-aware metadata describing an unapproved one) gets the
  // branded card with 200 + a SHORT cache, not a 404: a 404 renders as a broken
  // image in the owner's own preview, and the short TTL lets the real card
  // appear as soon as the listing is approved.
  if (!card) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${INK} 0%, #1E293B 60%, ${ACCENT} 100%)`,
            fontFamily: "NotoGe",
          }}
        >
          <div style={{ fontSize: story ? 96 : 76, fontWeight: 700, color: "#fff" }}>
            MyBakuriani
          </div>
          <div style={{ fontSize: story ? 44 : 34, color: MUTED, marginTop: 16 }}>
            ბაკურიანი
          </div>
        </div>
      ),
      { ...size, fonts, headers: cacheHeaders(300) },
    );
  }

  const titleSize = story ? 72 : 58;
  const metaSize = story ? 44 : 34;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          position: "relative",
          background: `linear-gradient(135deg, ${INK} 0%, #1E293B 100%)`,
          fontFamily: "NotoGe",
        }}
      >
        {card.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.cover}
            alt=""
            width={size.width}
            height={size.height}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}

        {/* Scrim: without it, light photos leave the title unreadable. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(to bottom, rgba(2,6,23,0.10) 0%, rgba(2,6,23,0.35) 45%, rgba(2,6,23,0.92) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: story ? 80 : 56,
            gap: story ? 24 : 18,
          }}
        >
          <div
            style={{
              // satori honours -webkit-line-clamp; keeps a long Georgian title
              // from pushing the price row off the card.
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontSize: titleSize,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.18,
            }}
          >
            {card.title}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {card.price ? (
              <div
                style={{
                  display: "flex",
                  fontSize: metaSize,
                  fontWeight: 700,
                  color: "#fff",
                  background: ACCENT,
                  borderRadius: 999,
                  padding: story ? "14px 32px" : "10px 26px",
                }}
              >
                {card.price}
              </div>
            ) : null}
            {card.location ? (
              <div style={{ display: "flex", fontSize: metaSize, color: MUTED }}>
                {card.location}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: story ? 24 : 10,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: story ? 40 : 30,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              MyBakuriani
            </div>
            <div
              style={{
                display: "flex",
                fontSize: story ? 34 : 26,
                color: MUTED,
              }}
            >
              mybakuriani.ge
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts, headers: cacheHeaders(3600) },
  );
}
