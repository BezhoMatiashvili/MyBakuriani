import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import {
  checkOwnershipDocumentBytes,
  isOwnershipDocumentKind,
  MAX_OWNERSHIP_DOCUMENT_BYTES,
  OWNERSHIP_DOCUMENT_EXTENSIONS,
} from "@/lib/ownership/document-file";
import { purgeOwnershipDocuments } from "@/lib/ownership/purge";
import { tryAcquireUpload } from "@/lib/ownership/upload-guard";
import type {
  OwnershipDocumentUploadError,
  OwnershipDocumentUploadResponse,
} from "@/lib/ownership/types";

export const runtime = "nodejs";

// Room for the multipart boundaries and the text fields next to a
// maximum-size file. next.config.ts raises middlewareClientMaxBodySize above
// this, or Next would silently truncate the body before this route runs.
const MAX_BODY_BYTES = MAX_OWNERSHIP_DOCUMENT_BYTES + 256 * 1024;

// Private bucket with no storage.objects policy (C5, C39): browsers never
// read or write it, and this route is its only writer.
const BUCKET = "ownership-documents";

function fail(
  error: OwnershipDocumentUploadError,
  status: number,
  headers?: HeadersInit,
) {
  return Response.json({ error }, { status, headers });
}

/**
 * One ID card, passport or registry extract per request (C39). The file is
 * identified by its bytes; its name and declared type are ignored, and it is
 * stored under a server-chosen path and content type. The row goes in first
 * (the per-owner cap is its insert trigger), the object second.
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return fail("unauthorized", 401);
  const userId = guard.user.id;

  if (
    !(await checkRateLimit(`ownership-document:user:${userId}`, 60, 3_600_000))
  ) {
    return fail("rate_limited", 429);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("too_large", 413);
  }

  // Before formData(): it buffers the whole body.
  const release = tryAcquireUpload(userId);
  if (!release) return fail("upload_busy", 429, { "Retry-After": "5" });
  try {
    const form = await req.formData().catch(() => null);
    if (!form) return fail("invalid_request", 400);
    const file = form.get("file");
    const kind = form.get("kind");
    const replaces = form.get("replacesDocumentId");
    if (!(file instanceof File)) return fail("invalid_request", 400);
    if (!isOwnershipDocumentKind(kind)) return fail("invalid_kind", 400);
    if (
      replaces !== null &&
      (typeof replaces !== "string" || !isUuid(replaces))
    ) {
      return fail("invalid_request", 400);
    }

    if (file.size > MAX_OWNERSHIP_DOCUMENT_BYTES) {
      return fail("too_large", 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkOwnershipDocumentBytes(bytes);
    if (!check.ok) {
      return check.problem === "tooLarge"
        ? fail("too_large", 413)
        : fail(check.problem, 400);
    }

    const id = crypto.randomUUID();
    const storagePath = `${userId}/${id}.${OWNERSHIP_DOCUMENT_EXTENSIONS[check.type]}`;
    const db = createServiceClient();
    const { error: insertError } = await db
      .from("ownership_verification_documents")
      .insert({
        id,
        owner_id: userId,
        kind,
        storage_path: storagePath,
        content_type: check.contentType,
        byte_size: bytes.length,
      });
    if (insertError) {
      if (insertError.message?.includes("OWNERSHIP_DOCUMENT_LIMIT")) {
        return fail("document_limit", 409);
      }
      console.error("[ownership] document row insert failed", insertError);
      return fail("upload_failed", 503);
    }

    let uploaded = false;
    try {
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(storagePath, bytes, {
          contentType: check.contentType,
          cacheControl: "60",
          upsert: false,
        });
      if (uploadError) {
        console.error("[ownership] document upload failed", uploadError);
      } else {
        uploaded = true;
      }
    } catch (error) {
      console.error("[ownership] document upload failed", error);
    }
    if (!uploaded) {
      // Keep the row: a timed-out write may still land, and the purge deletes
      // the object (if any) and settles the row either way.
      const { error: markError } = await db
        .from("ownership_verification_documents")
        .update({ upload_failed_at: new Date().toISOString() })
        .eq("id", id);
      if (markError) {
        console.error(
          "[ownership] could not flag failed upload",
          id,
          markError,
        );
      }
      return fail("upload_failed", 503);
    }

    if (replaces) {
      // false = not the caller's, already submitted or already gone: nothing
      // to discard, and the new file stands either way.
      const { error: discardError } = await db.rpc(
        "discard_ownership_document",
        { p_owner_id: userId, p_document_id: replaces },
      );
      if (discardError) {
        console.error("[ownership] discard failed", discardError.message);
      }
    }
    await purgeOwnershipDocuments({ ownerId: userId });

    const body: OwnershipDocumentUploadResponse = {
      id,
      kind,
      contentType: check.contentType,
      size: bytes.length,
    };
    return Response.json(body, { status: 201 });
  } finally {
    release();
  }
}
