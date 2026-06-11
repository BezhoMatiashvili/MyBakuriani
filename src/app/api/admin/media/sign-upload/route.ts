import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "landing-media";

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_KINDS = new Set(["banner", "blog"]);

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    sizeBytes?: number;
    kind?: string;
  } | null;

  if (!body?.contentType || typeof body.contentType !== "string") {
    return Response.json({ error: "contentType required" }, { status: 400 });
  }
  if (typeof body.sizeBytes !== "number" || body.sizeBytes <= 0) {
    return Response.json({ error: "sizeBytes required" }, { status: 400 });
  }
  if (!body.kind || !ALLOWED_KINDS.has(body.kind)) {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }

  const isImage = body.contentType in IMAGE_TYPES;
  const isVideo = body.contentType in VIDEO_TYPES;
  if (!isImage && !isVideo) {
    return Response.json(
      { error: `unsupported contentType: ${body.contentType}` },
      { status: 400 },
    );
  }

  const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (body.sizeBytes > maxBytes) {
    const mb = (maxBytes / 1024 / 1024).toFixed(0);
    // Georgian message kept as a fallback for older clients; UI prefers `code`.
    return Response.json(
      {
        error: `ფაილი ძალიან დიდია. მაქსიმუმი: ${mb}MB`,
        code: "file_too_large",
        maxMb: mb,
      },
      { status: 413 },
    );
  }

  const ext = isImage
    ? IMAGE_TYPES[body.contentType]
    : VIDEO_TYPES[body.contentType];
  const path = `${body.kind}/${crypto.randomUUID()}.${ext}`;

  const db = createServiceClient(guard.admin.userId);
  const { data: signed, error: signErr } = await db.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (signErr || !signed) {
    return Response.json(
      { error: signErr?.message ?? "sign failed" },
      { status: 500 },
    );
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);

  return Response.json({
    signedUrl: signed.signedUrl,
    token: signed.token,
    path,
    publicUrl: pub.publicUrl,
    mediaType: isVideo ? "video" : "image",
  });
}
