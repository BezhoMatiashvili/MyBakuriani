import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { MAX_OWNERSHIP_ITEMS } from "@/lib/ownership/document-file";
import { purgeOwnershipDocuments } from "@/lib/ownership/purge";
import type {
  OwnershipSubmitError,
  OwnershipSubmitItem,
  OwnershipSubmitRequest,
  OwnershipSubmitResponse,
} from "@/lib/ownership/types";

export const runtime = "nodejs";

// The tokens submit_ownership_verifications raises (C39 migration).
const RPC_ERRORS: [
  token: string,
  error: OwnershipSubmitError,
  status: number,
][] = [
  ["OWNERSHIP_INPUT_INVALID", "invalid_input", 400],
  ["OWNERSHIP_DOCUMENT_INVALID", "document_invalid", 400],
  ["OWNERSHIP_EXTRACT_SHARED", "extract_shared", 400],
  ["OWNERSHIP_LISTING_NOT_FOUND", "listing_not_found", 404],
  ["OWNERSHIP_REQUEST_EXISTS", "request_exists", 409],
];

function fail(error: OwnershipSubmitError, status: number) {
  return Response.json({ error }, { status });
}

function parseRequest(body: unknown): OwnershipSubmitRequest | null {
  if (!body || typeof body !== "object") return null;
  const { identityDocumentId, items } = body as Record<string, unknown>;
  if (typeof identityDocumentId !== "string" || !isUuid(identityDocumentId)) {
    return null;
  }
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > MAX_OWNERSHIP_ITEMS
  ) {
    return null;
  }
  const parsed: OwnershipSubmitItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const { kind, id, documentId } = item as Record<string, unknown>;
    // Only property listings (rentals, sales, hotels) are verified. The RPC
    // still takes service items, so this route is the gate.
    if (
      kind !== "property" ||
      typeof id !== "string" ||
      !isUuid(id) ||
      typeof documentId !== "string" ||
      !isUuid(documentId)
    ) {
      return null;
    }
    parsed.push({ kind, id, documentId });
  }
  return { identityDocumentId, items: parsed };
}

/**
 * Submits one ID plus a registry extract per listing for admin review (C39).
 * The RPC runs as the service role with the SESSION user as owner, and checks
 * every listing and document against that owner.
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (!guard.ok) return fail("unauthorized", 401);
  const userId = guard.user.id;

  if (
    !(await checkRateLimit(`ownership-submit:user:${userId}`, 10, 3_600_000))
  ) {
    return fail("rate_limited", 429);
  }
  const input = parseRequest(await req.json().catch(() => null));
  if (!input) return fail("invalid_input", 400);

  const db = createServiceClient();
  const { data, error } = await db.rpc("submit_ownership_verifications", {
    p_owner_id: userId,
    p_identity_document_id: input.identityDocumentId,
    p_items: input.items.map((item) => ({
      kind: item.kind,
      id: item.id,
      document_id: item.documentId,
    })),
  });
  if (error) {
    const known = RPC_ERRORS.find(([token]) => error.message?.includes(token));
    if (known) return fail(known[1], known[2]);
    console.error("[ownership] submit failed", error);
    return fail("submit_failed", 500);
  }

  await purgeOwnershipDocuments({ ownerId: userId });

  const result = data as { submission_id: string; count: number };
  const body: OwnershipSubmitResponse = {
    submissionId: result.submission_id,
    count: result.count,
  };
  return Response.json(body, { status: 201 });
}
