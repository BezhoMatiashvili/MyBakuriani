import { NextRequest } from "next/server";
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

function watermarkSvg(width: number, height: number) {
  const fontSize = Math.max(16, Math.round(Math.min(width, height) / 22));
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width - 20}" y="${height - 20}" text-anchor="end" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700" fill="white" fill-opacity=".78">my-bakuriani</text></svg>`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkRateLimit(`media-finalize:${getClientIp(req)}`, 12, 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const db = createServiceClient();
  const intentDb = db as any;
  const { data: intent } = await intentDb.from("media_upload_intents").select("*").eq("id", id).maybeSingle();
  if (!intent || intent.owner_id !== user.id || intent.finalized_at || new Date(intent.expires_at) < new Date()) {
    return Response.json({ error: "invalid_or_expired_intent" }, { status: 409 });
  }
  const { data: source, error: downloadError } = await db.storage.from(QUARANTINE_BUCKET).download(intent.quarantine_path);
  if (downloadError || !source || source.size < 1 || source.size > MAX_BYTES || source.size !== intent.expected_bytes) {
    console.error("invalid quarantined media", downloadError);
    return Response.json({ error: "invalid_media" }, { status: 422 });
  }
  try {
    const input = Buffer.from(await source.arrayBuffer());
    const image = sharp(input, { failOn: "error", limitInputPixels: MAX_DIMENSION * MAX_DIMENSION });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      return Response.json({ error: "invalid_media" }, { status: 422 });
    }
    const output = await image.rotate().composite([{ input: watermarkSvg(metadata.width, metadata.height), gravity: "southeast" }]).webp({ quality: 86 }).toBuffer();
    const finalBucket = intent.listing_type === "property" ? "property-photos" : "service-photos";
    const finalPath = `${intent.owner_id}/${intent.listing_id}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await db.storage.from(finalBucket).upload(finalPath, output, {
      contentType: "image/webp", upsert: false, cacheControl: "31536000",
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = db.storage.from(finalBucket).getPublicUrl(finalPath);
    const canonicalUrl = urlData.publicUrl;
    const { error: finalizeError } = await intentDb.from("media_upload_intents").update({
      finalized_at: new Date().toISOString(), canonical_url: canonicalUrl, canonical_path: finalPath,
    }).eq("id", id).eq("owner_id", user.id).is("finalized_at", null);
    if (finalizeError) throw finalizeError;
    await db.storage.from(QUARANTINE_BUCKET).remove([intent.quarantine_path]);
    return Response.json({ url: canonicalUrl, path: finalPath });
  } catch (error) {
    console.error("media finalization failed", error);
    return Response.json({ error: "media_processing_failed" }, { status: 422 });
  }
}
