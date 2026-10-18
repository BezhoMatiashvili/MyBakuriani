import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

// GET /api/admin/ownership-verifications/documents/[id] — an admin opens an
// owner's ID card or registry extract (C39). The answer is a 302 to a 60 s
// signed URL signed with no file-save option, so the file opens in the
// browser's own viewer instead of being saved on the admin's computer.

const SIGNED_URL_SECONDS = 60;

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const allowed = await checkRateLimit(
    `ownership-document-read:admin:${guard.admin.userId}`,
    120,
    600_000,
  );
  if (!allowed) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const db = createServiceClient();
  const { data: doc, error } = await db
    .from("ownership_verification_documents")
    .select("storage_path, discarded_at, purge_claimed_at, purged_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/ownership-document] lookup failed:", error.message);
    return Response.json({ error: "lookup_failed" }, { status: 500 });
  }
  // A replaced file, or one already claimed for deletion, is gone for
  // admins too, even while its object may still exist.
  if (!doc || doc.discarded_at || doc.purge_claimed_at || doc.purged_at) {
    return notFound();
  }

  const { data: signed, error: signError } = await db.storage
    .from("ownership-documents")
    .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      // The URL is a short-lived credential: never cache it, never send it
      // on as a Referer.
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
