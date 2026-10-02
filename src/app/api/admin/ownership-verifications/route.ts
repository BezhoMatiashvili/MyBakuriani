import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import {
  MAX_OWNERSHIP_DECISION_NOTE,
  isOwnershipVerificationStatus,
} from "@/lib/ownership/document-file";
import { purgeOwnershipDocuments } from "@/lib/ownership/purge";
import type {
  AdminOwnershipAction,
  AdminOwnershipDocument,
  AdminOwnershipItem,
  AdminOwnershipListFilter,
  AdminOwnershipListResponse,
  AdminOwnershipReviewResponse,
  OwnershipVerificationStatus,
} from "@/lib/ownership/types";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

// Admin review of ownership verifications (C39). Wire shapes and error codes:
// src/lib/ownership/types.ts.

type ServiceClient = ReturnType<typeof createServiceClient>;

const PENDING_CAP = 500;
const PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 100;
// Every id the search resolves is sent in the verifications query's URL, so
// each lookup is capped to keep that URL well under the gateway's limit.
const SEARCH_LOOKUP_CAP = 25;
// The joins read by id in chunks for the same reason: 500 pending rows can
// reference 1000 documents.
const ID_CHUNK = 100;

const STATUSES: Record<
  AdminOwnershipListFilter,
  OwnershipVerificationStatus[]
> = {
  pending: ["pending"],
  approved: ["approved"],
  decided: ["approved", "rejected", "revoked"],
};

const ACTIONS: AdminOwnershipAction[] = ["approve", "reject", "revoke"];

// Stable tokens raised by review_ownership_verification → { error } + status.
const REVIEW_ERRORS: [token: string, error: string, status: number][] = [
  ["OWNERSHIP_REVIEW_ACTION_INVALID", "invalid_action", 400],
  ["OWNERSHIP_NOTE_REQUIRED", "note_required", 400],
  ["OWNERSHIP_NOTE_TOO_LONG", "note_too_long", 400],
  ["OWNERSHIP_REVIEW_FORBIDDEN", "forbidden", 403],
  ["OWNERSHIP_REVIEW_SELF", "self_review", 403],
  ["OWNERSHIP_REQUEST_NOT_FOUND", "not_found", 404],
  ["OWNERSHIP_ALREADY_DECIDED", "already_decided", 409],
  ["OWNERSHIP_DOCUMENT_MISSING", "document_missing", 409],
];

type Rows<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/** Runs `load` once per chunk of distinct ids and concatenates the rows. */
async function loadByIds<T>(
  ids: string[],
  load: (chunk: string[]) => Rows<T>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    chunks.push(unique.slice(i, i + ID_CHUNK));
  }
  const results = await Promise.all(chunks.map(load));
  return results.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}

/**
 * Turns the admin's search text into an `.or()` filter over listing and owner
 * ids, or null when nothing matches. The ids are resolved first because
 * PostgREST cannot OR across embedded tables, and the typed text never goes
 * into the `.or()` string itself (its grammar reads , . ( ) as syntax). Each
 * lookup only considers listings and owners that have a request in the shown
 * statuses (`!inner`), so the cap rarely bites.
 */
async function searchFilter(
  db: ServiceClient,
  q: string,
  statuses: OwnershipVerificationStatus[],
): Promise<string | null> {
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const [byPropertyTitle, byServiceTitle, byOwnerName, byOwnerPhone] =
    await Promise.all([
      db
        .from("properties")
        .select("id, ownership_verifications!inner(id)")
        .ilike("title", pattern)
        .in("ownership_verifications.status", statuses)
        .limit(SEARCH_LOOKUP_CAP),
      db
        .from("services")
        .select("id, ownership_verifications!inner(id)")
        .ilike("title", pattern)
        .in("ownership_verifications.status", statuses)
        .limit(SEARCH_LOOKUP_CAP),
      db
        .from("profiles")
        .select(
          "id, ownership_verifications!ownership_verifications_owner_id_fkey!inner(id)",
        )
        .ilike("display_name", pattern)
        .in("ownership_verifications.status", statuses)
        .limit(SEARCH_LOOKUP_CAP),
      db
        .from("profiles")
        .select(
          "id, ownership_verifications!ownership_verifications_owner_id_fkey!inner(id)",
        )
        .ilike("phone", pattern)
        .in("ownership_verifications.status", statuses)
        .limit(SEARCH_LOOKUP_CAP),
    ]);
  const failed = [
    byPropertyTitle,
    byServiceTitle,
    byOwnerName,
    byOwnerPhone,
  ].find((res) => res.error);
  if (failed?.error) throw new Error(failed.error.message);

  const propertyIds = (byPropertyTitle.data ?? []).map((row) => row.id);
  const serviceIds = (byServiceTitle.data ?? []).map((row) => row.id);
  const ownerIds = [
    ...new Set(
      [...(byOwnerName.data ?? []), ...(byOwnerPhone.data ?? [])].map(
        (row) => row.id,
      ),
    ),
  ];
  if (isUuid(q)) {
    propertyIds.push(q);
    serviceIds.push(q);
  }

  const clauses: string[] = [];
  if (propertyIds.length)
    clauses.push(`property_id.in.(${propertyIds.join(",")})`);
  if (serviceIds.length)
    clauses.push(`service_id.in.(${serviceIds.join(",")})`);
  if (ownerIds.length) clauses.push(`owner_id.in.(${ownerIds.join(",")})`);
  return clauses.length ? clauses.join(",") : null;
}

function parsePage(value: string | null): number {
  const page = Number(value ?? 0);
  return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const filter = params.get("status");
  if (filter !== "pending" && filter !== "approved" && filter !== "decided") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const pending = filter === "pending";
  const page = pending ? 0 : parsePage(params.get("page"));
  const pageSize = pending ? PENDING_CAP : PAGE_SIZE;
  const statuses = STATUSES[filter];
  const q = pending
    ? ""
    : (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  const db = createServiceClient();
  try {
    const match = q ? await searchFilter(db, q, statuses) : null;
    if (q && !match) {
      return Response.json({
        items: [],
        total: 0,
        page,
        pageSize,
      } satisfies AdminOwnershipListResponse);
    }

    // The count is its own head request: with `count` on the page request,
    // a page past the end (rows decided meanwhile) would answer 416.
    let countQuery = db
      .from("ownership_verifications")
      .select("id", { count: "exact", head: true })
      .in("status", statuses);
    let pageQuery = db
      .from("ownership_verifications")
      .select(
        "id, submission_id, owner_id, property_id, service_id, status, decision_note, created_at, reviewed_at, identity_document_id, registry_extract_document_id",
      )
      .in("status", statuses);
    if (match) {
      countQuery = countQuery.or(match);
      pageQuery = pageQuery.or(match);
    }
    pageQuery = pending
      ? pageQuery.order("created_at", { ascending: true })
      : pageQuery
          .order("reviewed_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
    const from = page * pageSize;
    const [countRes, pageRes] = await Promise.all([
      countQuery,
      // `id` last: rows of one submission share created_at, and without a
      // unique tiebreaker pages could repeat or skip rows.
      pageQuery.order("id").range(from, from + pageSize - 1),
    ]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (pageRes.error) throw new Error(pageRes.error.message);
    const rows = pageRes.data ?? [];

    const [properties, services, owners, documents] = await Promise.all([
      loadByIds(
        rows.flatMap((row) => (row.property_id ? [row.property_id] : [])),
        (chunk) =>
          db
            .from("properties")
            .select(
              "id, title, type, is_for_sale, location, status, cadastral_code",
            )
            .in("id", chunk),
      ),
      loadByIds(
        rows.flatMap((row) => (row.service_id ? [row.service_id] : [])),
        (chunk) =>
          db
            .from("services")
            .select("id, title, category, location, status")
            .in("id", chunk),
      ),
      loadByIds(
        rows.map((row) => row.owner_id),
        (chunk) =>
          db
            .from("profiles")
            .select("id, display_name, phone, personal_id")
            .in("id", chunk),
      ),
      loadByIds(
        rows.flatMap((row) => [
          row.identity_document_id,
          row.registry_extract_document_id,
        ]),
        (chunk) =>
          db
            .from("ownership_verification_documents")
            .select(
              "id, content_type, byte_size, discarded_at, purge_claimed_at, purged_at",
            )
            .in("id", chunk),
      ),
    ]);
    const propertyById = new Map(properties.map((p) => [p.id, p]));
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    const documentById = new Map(documents.map((d) => [d.id, d]));

    const toDocument = (id: string): AdminOwnershipDocument => {
      const doc = documentById.get(id);
      return {
        id,
        contentType: doc?.content_type ?? "",
        size: doc?.byte_size ?? 0,
        available:
          !!doc && !doc.discarded_at && !doc.purge_claimed_at && !doc.purged_at,
      };
    };

    const toListing = (
      row: (typeof rows)[number],
    ): AdminOwnershipItem["listing"] | null => {
      const property = row.property_id && propertyById.get(row.property_id);
      if (property) {
        // A NULL status reads as the column default.
        const status = property.status ?? "pending";
        return {
          kind: "property",
          id: property.id,
          title: property.title,
          category: null,
          propertyType: property.type,
          isForSale: property.is_for_sale,
          location: property.location,
          status,
          cadastralCode: property.cadastral_code,
          href: propertyViewUrl(property, { preview: status !== "active" }),
        };
      }
      const service = row.service_id && serviceById.get(row.service_id);
      if (service) {
        const status = service.status ?? "pending";
        return {
          kind: "service",
          id: service.id,
          title: service.title,
          category: service.category,
          propertyType: null,
          isForSale: null,
          location: service.location,
          status,
          cadastralCode: null,
          href: serviceViewUrl(service, { preview: status !== "active" }),
        };
      }
      return null;
    };

    const items = rows.flatMap((row): AdminOwnershipItem[] => {
      const listing = toListing(row);
      // The listing was deleted after the page was read.
      if (!listing || !isOwnershipVerificationStatus(row.status)) return [];
      const owner = ownerById.get(row.owner_id);
      return [
        {
          id: row.id,
          submissionId: row.submission_id,
          status: row.status,
          decisionNote: row.decision_note,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at,
          owner: owner
            ? {
                id: owner.id,
                displayName: owner.display_name,
                phone: owner.phone,
                personalId: owner.personal_id,
              }
            : null,
          listing,
          documents: {
            identity: toDocument(row.identity_document_id),
            extract: toDocument(row.registry_extract_document_id),
          },
        },
      ];
    });

    return Response.json({
      items,
      total: countRes.count ?? 0,
      page,
      pageSize,
    } satisfies AdminOwnershipListResponse);
  } catch (error) {
    console.error(
      "[admin/ownership-verifications] list failed:",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ error: "load_failed" }, { status: 500 });
  }
}

type ReviewResult = {
  status: OwnershipVerificationStatus;
  owner_id: string;
  property_id: string | null;
  service_id: string | null;
  idempotent: boolean;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    action?: unknown;
    note?: unknown;
  } | null;
  if (typeof body?.id !== "string" || !isUuid(body.id)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const action = ACTIONS.find((value) => value === body.action);
  if (!action) {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }
  // The RPC trims the note and counts characters (char_length), so this
  // early check does too.
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (
    (body.note != null && typeof body.note !== "string") ||
    [...note].length > MAX_OWNERSHIP_DECISION_NOTE
  ) {
    return Response.json({ error: "note_too_long" }, { status: 400 });
  }

  const adminId = guard.admin.userId;
  const db = createServiceClient(adminId);
  const { data, error } = await db.rpc("review_ownership_verification", {
    p_verification_id: body.id,
    p_admin_id: adminId,
    p_action: action,
    p_note: note || undefined,
  });
  if (error) {
    const known = REVIEW_ERRORS.find(([token]) =>
      error.message.includes(token),
    );
    if (known) {
      return Response.json({ error: known[1] }, { status: known[2] });
    }
    console.error(
      "[admin/ownership-verifications] review failed:",
      error.message,
    );
    return Response.json({ error: "review_failed" }, { status: 500 });
  }

  const result = data as ReviewResult;
  if (!result.idempotent) {
    const kind = result.property_id ? "property" : "service";
    const listingId = result.property_id ?? result.service_id;
    if (listingId) revalidateTag(listingTag(kind, listingId));
    revalidateListingLists(kind);
    // Best effort (never throws): a decided request's files are not needed
    // any more; the hourly purge catches whatever this misses.
    await purgeOwnershipDocuments({ ownerId: result.owner_id });
  }

  return Response.json({
    status: result.status,
    idempotent: result.idempotent,
  } satisfies AdminOwnershipReviewResponse);
}
