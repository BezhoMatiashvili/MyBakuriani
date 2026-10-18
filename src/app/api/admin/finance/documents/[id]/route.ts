import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
  readJsonObject,
  readOneOf,
  requireText,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// One primary document (spec §12, C42).
//   GET   302 to a 60 s signed URL without a file-save option (it opens in
//         the browser's viewer), as for ownership documents (C39)
//   POST  {action: "void", reason} — voided documents stay in the archive

type Ctx = { params: Promise<{ id: string }> };

const SIGNED_URL_SECONDS = 60;

export async function GET(_request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("not_found", 404);
  const allowed = await checkRateLimit(
    `finance-document-read:admin:${guard.admin.userId}`,
    120,
    600_000,
  );
  if (!allowed) return jsonError("rate_limited", 429);

  const db = createServiceClient();
  const { data: doc, error } = await db
    .from("finance_documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return financeErrorResponse(error, "document lookup");
  if (!doc) return jsonError("not_found", 404);
  const { data: signed, error: signError } = await db.storage
    .from("finance-documents")
    .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
  if (signError || !signed?.signedUrl) return jsonError("not_found", 404);
  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.signedUrl,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("not_found", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  try {
    readOneOf(body.action, ["void"] as const, "action");
    const { data, error } = await createServiceClient(guard.admin.userId)
      .from("finance_documents")
      .update({
        status: "voided",
        void_reason: requireText(body.reason, "reason", 500),
        voided_by: guard.admin.userId,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("not_found", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return financeErrorResponse(error, `document ${id}`);
  }
}
