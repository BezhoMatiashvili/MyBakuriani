import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUARANTINE_BUCKET = "media-quarantine";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 4096;

// The MyBakuriani logo watermark (brand-coloured, transparent background),
// shared with the client uploader (public/watermark.png). Bundled into the
// serverless function via next.config.ts outputFileTracingIncludes.
const WATERMARK_PATH = path.join(process.cwd(), "public", "watermark.png");
const WATERMARK_WIDTH_RATIO = 0.18;
const WATERMARK_OPACITY = 0.72;
let watermarkMaster: Buffer | null = null;
function watermarkMasterBuf(): Buffer {
  if (!watermarkMaster) watermarkMaster = fs.readFileSync(WATERMARK_PATH);
  return watermarkMaster;
}

// Logo sized to WATERMARK_WIDTH_RATIO of the photo width, at WATERMARK_OPACITY.
// The white tile with blend "dest-in" scales the logo's existing alpha (sharp
// composite has no direct opacity control).
async function watermarkOverlay(photoWidth: number): Promise<Buffer> {
  const wmW = Math.max(80, Math.round(photoWidth * WATERMARK_WIDTH_RATIO));
  return sharp(watermarkMasterBuf())
    .resize({ width: wmW, withoutEnlargement: true })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([
          255,
          255,
          255,
          Math.round(255 * WATERMARK_OPACITY),
        ]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !(await checkRateLimit(`media-finalize:${getClientIp(req)}`, 12, 60_000))
  ) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const { id } = await params;
  if (!isUuid(id))
    return Response.json({ error: "not_found" }, { status: 404 });
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });

  const db = createServiceClient();
  const intentDb = db as any;
  const { data: intent } = await intentDb
    .from("media_upload_intents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (
    !intent ||
    intent.owner_id !== user.id ||
    intent.finalized_at ||
    new Date(intent.expires_at) < new Date()
  ) {
    return Response.json(
      { error: "invalid_or_expired_intent" },
      { status: 409 },
    );
  }
  const { data: source, error: downloadError } = await db.storage
    .from(QUARANTINE_BUCKET)
    .download(intent.quarantine_path);
  if (
    downloadError ||
    !source ||
    source.size < 1 ||
    source.size > MAX_BYTES ||
    source.size !== intent.expected_bytes
  ) {
    console.error("invalid quarantined media", downloadError);
    return Response.json({ error: "invalid_media" }, { status: 422 });
  }
  try {
    const input = Buffer.from(await source.arrayBuffer());
    // Apply EXIF orientation up front so width/height (and the watermark
    // placement below) reflect the pixels as they will actually be encoded.
    const rotated = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
    })
      .rotate()
      .toBuffer();
    const metadata = await sharp(rotated).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_DIMENSION ||
      metadata.height > MAX_DIMENSION ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    ) {
      return Response.json({ error: "invalid_media" }, { status: 422 });
    }
    const overlay = await watermarkOverlay(metadata.width);
    const overlayMeta = await sharp(overlay).metadata();
    const pad = Math.max(12, Math.round(metadata.width * 0.022));
    const output = await sharp(rotated)
      .composite([
        {
          input: overlay,
          top: Math.max(0, metadata.height - (overlayMeta.height ?? 0) - pad),
          left: Math.max(0, metadata.width - (overlayMeta.width ?? 0) - pad),
        },
      ])
      .webp({ quality: 86 })
      .toBuffer();
    const finalBucket =
      intent.listing_type === "property" ? "property-photos" : "service-photos";
    const finalPath = `${intent.owner_id}/${intent.listing_id}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await db.storage
      .from(finalBucket)
      .upload(finalPath, output, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "31536000",
      });
    if (uploadError) throw uploadError;
    const { data: urlData } = db.storage
      .from(finalBucket)
      .getPublicUrl(finalPath);
    const canonicalUrl = urlData.publicUrl;
    const { error: finalizeError } = await intentDb
      .from("media_upload_intents")
      .update({
        finalized_at: new Date().toISOString(),
        canonical_url: canonicalUrl,
        canonical_path: finalPath,
      })
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("finalized_at", null);
    if (finalizeError) throw finalizeError;
    await db.storage.from(QUARANTINE_BUCKET).remove([intent.quarantine_path]);
    return Response.json({ url: canonicalUrl, path: finalPath });
  } catch (error) {
    console.error("media finalization failed", error);
    return Response.json({ error: "media_processing_failed" }, { status: 422 });
  }
}
