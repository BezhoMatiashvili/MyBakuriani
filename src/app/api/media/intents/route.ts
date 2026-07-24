import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const QUARANTINE_BUCKET = "media-quarantine";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type IntentBody = {
  listing_id?: string;
  listing_type?: "property" | "service";
  content_type?: string;
  byte_size?: number;
};

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(`media-intent:${getClientIp(req)}`, 12, 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as IntentBody | null;
  if (!body || typeof body.listing_id !== "string" || !isUuid(body.listing_id) ||
    (body.listing_type !== "property" && body.listing_type !== "service") ||
    !ALLOWED_TYPES.has(body.content_type ?? "") ||
    !Number.isInteger(body.byte_size) || body.byte_size! < 1 || body.byte_size! > MAX_BYTES) {
    return Response.json({ error: "invalid_upload_intent" }, { status: 400 });
  }
  const listingId = body.listing_id as string;
  const listingType = body.listing_type as "property" | "service";
  const contentType = body.content_type as string;
  const byteSize = body.byte_size as number;

  const db = createServiceClient();
  const table = listingType === "property" ? "properties" : "services";
  const { data: listing } = await db.from(table).select("owner_id").eq("id", listingId).maybeSingle();
  if (!listing || listing.owner_id !== user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const extension = contentType.split("/")[1];
  const objectPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const intentDb = db as any;
  const { data: intent, error } = await intentDb.from("media_upload_intents").insert({
    owner_id: user.id,
    listing_id: listingId,
    listing_type: listingType,
    quarantine_path: objectPath,
    content_type: contentType,
    expected_bytes: byteSize,
    expires_at: expiresAt,
  }).select("id, expires_at").single();
  if (error || !intent) {
    console.error("creating media intent failed", error);
    return Response.json({ error: "upload_unavailable" }, { status: 503 });
  }
  const { data: signed, error: signedError } = await db.storage
    .from(QUARANTINE_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });
  if (signedError || !signed) {
    console.error("creating signed media upload failed", signedError);
    await intentDb.from("media_upload_intents").delete().eq("id", intent.id);
    return Response.json({ error: "upload_unavailable" }, { status: 503 });
  }
  return Response.json({
    intent_id: intent.id,
    expires_at: intent.expires_at,
    token: signed.token,
    signed_url: signed.signedUrl,
    path: objectPath,
  }, { status: 201 });
}
