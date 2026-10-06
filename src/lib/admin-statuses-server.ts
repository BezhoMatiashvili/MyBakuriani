import "server-only";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";
import {
  ADMIN_STATUS_PAGE_SIZE,
  adminStatusErrorFromDb,
  type AdminStatusErrorCode,
  type ChangeResult,
} from "@/lib/admin-statuses";

// Shared plumbing of /api/admin/statuses/** (C44): no-store JSON, paging,
// the search term, the RPC call with its error mapping, and the cache bust
// after a real apply. Reads use the cached service client; writes carry the
// admin's id so trg_audit_row records the actor.

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: AdminStatusErrorCode): Response {
  const status =
    error === "forbidden"
      ? 403
      : error === "subscription_not_found"
        ? 404
        : error === "rate_limited"
          ? 429
          : error === "server_error"
            ? 500
            : 400;
  return json({ error }, status);
}

export function readPage(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

export function pageRange(page: number): [number, number] {
  const from = (page - 1) * ADMIN_STATUS_PAGE_SIZE;
  return [from, from + ADMIN_STATUS_PAGE_SIZE - 1];
}

/** Free text for a PostgREST `.or()` ilike, or null. */
export function readSearch(params: URLSearchParams): string | null {
  const q = sanitizeQuery((params.get("q") ?? "").slice(0, 100));
  return q ? q : null;
}

/** One of `allowed`, or null. */
export function readOneOf<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = params.get(key);
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** "expiring within N days" as an ISO upper bound, or null. */
export function readExpiringBound(
  params: URLSearchParams,
  windows: readonly number[],
): string | null {
  const days = Number(params.get("expiring"));
  if (!windows.includes(days)) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// --- filter plumbing (one Op list per filter, shared by the page, the counts
// and the select-all id list, so "select all N" is exactly what is listed) ---

export type Op =
  | ["eq" | "gt" | "lte", string, string | number | boolean]
  | ["isnull" | "notnull", string]
  | ["or", string];

type Chain = {
  eq(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  is(column: string, value: null): Chain;
  not(column: string, operator: string, value: unknown): Chain;
  or(filter: string): Chain;
};

export function applyOps<Q>(query: Q, ops: Op[]): Q {
  let chain = query as unknown as Chain;
  for (const op of ops) {
    if (op[0] === "or") chain = chain.or(op[1]);
    else if (op[0] === "isnull") chain = chain.is(op[1], null);
    else if (op[0] === "notnull") chain = chain.not(op[1], "is", null);
    else chain = chain[op[0]](op[1], op[2]);
  }
  return chain as unknown as Q;
}

/** An ilike search over `columns` (plus exact `extra` terms) as one OR. */
export function searchOp(
  q: string | null,
  columns: string[],
  extra: string[] = [],
): Op[] {
  const text = (q ?? "").replace(/\*/g, " ").trim();
  if (!text) return [];
  const parts = [...columns.map((c) => `${c}.ilike.*${text}*`), ...extra];
  return [["or", parts.join(",")]];
}

type ChangeRpc =
  | "admin_change_memberships"
  | "admin_change_listing_promotions"
  | "admin_change_company_plans";

/**
 * Calls one of the three change RPCs as the admin. Previews and applies share
 * the limiter (60 a minute per admin) so a stuck UI cannot hammer the locks.
 */
export async function runChange(
  rpc: ChangeRpc,
  adminId: string,
  args: Record<string, unknown>,
): Promise<{ result: ChangeResult } | { response: Response }> {
  if (!(await checkRateLimit(`admin-statuses:${adminId}`, 60, 60_000))) {
    return { response: errorResponse("rate_limited") };
  }
  const db = createServiceClient(adminId);
  const { data, error } = await db.rpc(rpc, {
    p_admin_id: adminId,
    ...args,
  } as never);
  if (error) {
    const code = adminStatusErrorFromDb(error.message);
    if (code) return { response: errorResponse(code) };
    console.error(`[admin-statuses] ${rpc} failed`, error);
    return { response: errorResponse("server_error") };
  }
  return { result: data as unknown as ChangeResult };
}

/** Busts the public pages of listings whose promotion really changed. */
export function revalidatePromotedListings(result: ChangeResult): void {
  if (!result.applied) return;
  const kinds = new Set<"property" | "service">();
  for (const row of result.rows) {
    if (row.outcome !== "changed" || !row.kind || !row.target_id) continue;
    revalidateTag(listingTag(row.kind, row.target_id));
    kinds.add(row.kind);
  }
  for (const kind of kinds) revalidateListingLists(kind);
}

/**
 * Busts the rentals of owners whose cover flipped (C31: public_properties
 * shows a rental only while its owner is covered right now).
 */
export async function revalidateCoveredRentals(
  result: ChangeResult,
): Promise<void> {
  if (!result.applied) return;
  const owners = new Set<string>();
  for (const row of result.rows) {
    const effects = row.effects ?? {};
    if (
      row.outcome === "changed" &&
      row.user_id &&
      typeof effects.covered_before === "boolean" &&
      effects.covered_before !== effects.covered_after
    ) {
      owners.add(row.user_id);
    }
  }
  if (owners.size === 0) return;
  const { data, error } = await createServiceClient()
    .from("properties")
    .select("id")
    .in("owner_id", [...owners])
    .or("is_for_sale.is.null,is_for_sale.eq.false");
  if (error) {
    console.error(
      "[admin-statuses] rental lookup for revalidation failed",
      error,
    );
  }
  for (const row of data ?? []) revalidateTag(listingTag("property", row.id));
  revalidateListingLists("property");
}

/** A company grant linked sale listings to the organization. */
export function revalidateCompanyLinks(result: ChangeResult): void {
  if (!result.applied) return;
  const linked = result.rows.some(
    (row) =>
      row.outcome === "changed" &&
      typeof row.effects?.linked_listings === "number" &&
      row.effects.linked_listings > 0,
  );
  if (linked) revalidateListingLists("property");
}
