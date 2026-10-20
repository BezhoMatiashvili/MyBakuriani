import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import {
  freePeriodErrorFromDb,
  toFreePeriodView,
  type FreePeriodApplyResult,
  type FreePeriodErrorCode,
  type FreePeriodRow,
  type FreePeriodStats,
  type FreePeriodView,
} from "@/lib/free-periods";

// Shared plumbing of /api/admin/free-periods/** (C53): no-store JSON, the error
// mapping, the admin limiter, the period list with its counters and the apply
// loop. Reads use the cached service client; writes carry the admin's id so
// trg_audit_row records the actor (also on the rows a sweep grants).

/** Explicit column list: the period tables are never read with select("*"). */
export const FREE_PERIOD_SELECT =
  "id, name, benefit, registration_starts_at, registration_ends_at, benefit_ends_at, roles, max_listings, is_active, created_at";

/** Rows per free_period_apply call (the function's own default, C44's cap). */
const APPLY_CHUNK = 200;
/** One click runs at most this many rounds; the 5-minute cron finishes the rest. */
const APPLY_MAX_ROUNDS = 10;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: FreePeriodErrorCode): Response {
  const status =
    error === "forbidden"
      ? 403
      : error === "not_found"
        ? 404
        : error === "period_ended" || error === "benefit_locked"
          ? 409
          : error === "rate_limited"
            ? 429
            : error === "server_error"
              ? 500
              : 400;
  return json({ error }, status);
}

/** 60 requests a minute per admin (list, save and apply share it). */
export async function withinRateLimit(adminId: string): Promise<boolean> {
  return checkRateLimit(`admin-free-periods:${adminId}`, 60, 60_000);
}

/** A failed query as a response: a known database token, else a logged 500. */
export function dbErrorResponse(
  error: { message: string; code?: string; hint?: string | null },
  where: string,
): Response {
  const code = freePeriodErrorFromDb(error.message);
  if (code) return errorResponse(code);
  // Fixed label plus the error's own code, message and hint: never the object
  // (a constraint failure's detail can carry a row).
  console.error(
    `[free-periods] ${where} failed`,
    error.code,
    error.message,
    error.hint,
  );
  return errorResponse("server_error");
}

type StatsRow = FreePeriodStats & { id: string };

/** Every period, newest first, with its granted / waiting counters. */
export async function loadViews(
  adminId: string,
): Promise<{ views: FreePeriodView[] } | { response: Response }> {
  const db = createServiceClient();
  const [rows, stats] = await Promise.all([
    db
      .from("free_periods")
      .select(FREE_PERIOD_SELECT)
      .order("created_at", { ascending: false }),
    db.rpc("admin_free_period_stats", { p_admin_id: adminId }),
  ]);
  if (rows.error) return { response: dbErrorResponse(rows.error, "list") };
  if (stats.error) return { response: dbErrorResponse(stats.error, "stats") };
  const byId = new Map(
    (stats.data as unknown as StatsRow[]).map((row) => [row.id, row]),
  );
  const now = Date.now();
  return {
    views: (rows.data as unknown as FreePeriodRow[]).map((row) =>
      toFreePeriodView(row, byId.get(row.id), now),
    ),
  };
}

/**
 * Runs free_period_apply until nothing remains (at most APPLY_MAX_ROUNDS
 * chunks) and sums the rounds. A round that changed nothing ends the loop even
 * if rows remain (they are skipped for a reason the next sweep will re-check).
 * Busts the public list pages when anything changed.
 */
export async function applyPeriod(
  adminId: string,
  id: string,
): Promise<{ result: FreePeriodApplyResult } | { response: Response }> {
  const db = createServiceClient(adminId);
  const total: FreePeriodApplyResult = {
    state: "running",
    granted_members: 0,
    granted_listings: 0,
    redated: 0,
    skipped: 0,
    remaining: 0,
  };
  for (let round = 0; round < APPLY_MAX_ROUNDS; round++) {
    const { data, error } = await db.rpc("free_period_apply", {
      p_period: id,
      p_limit: APPLY_CHUNK,
    });
    if (error) return { response: dbErrorResponse(error, "apply") };
    const step = data as unknown as FreePeriodApplyResult;
    total.state = step.state;
    total.granted_members += step.granted_members;
    total.granted_listings += step.granted_listings;
    total.redated += step.redated;
    total.skipped += step.skipped;
    total.remaining = step.remaining;
    const progressed =
      step.granted_members + step.granted_listings + step.redated > 0;
    if (step.state !== "running" || step.remaining === 0 || !progressed) break;
  }
  if (total.granted_members + total.granted_listings + total.redated > 0) {
    revalidateListingLists("property");
    revalidateListingLists("service");
  }
  return { result: total };
}
