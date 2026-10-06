import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ADMIN_STATUS_MAX_TARGETS,
  ADMIN_STATUS_PAGE_SIZE,
  EXPIRING_WINDOWS,
  MEMBERSHIP_SCOPES,
  MEMBERSHIP_SEASONS,
  MEMBERSHIP_STATES,
  isUuid,
  parseMembershipChange,
  tbilisiToday,
} from "@/lib/admin-statuses";
import {
  applyOps,
  errorResponse,
  json,
  pageRange,
  readExpiringBound,
  readOneOf,
  readPage,
  readSearch,
  revalidateCoveredRentals,
  runChange,
  searchOp,
  type Op,
} from "@/lib/admin-statuses-server";

// Admin membership management (C44): GET lists admin_membership_overview_v
// with filters, state counts and the select-all id list; POST previews or
// applies one admin_change_memberships call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW = "admin_membership_overview_v";

function filterOps(params: URLSearchParams, withState: boolean): Op[] {
  const ops: Op[] = [];
  const scope = readOneOf(params, "scope", MEMBERSHIP_SCOPES) ?? "members";
  if (scope === "members") ops.push(["gt", "row_count", 0]);

  const q = readSearch(params);
  const extra: string[] = [];
  if (isUuid(q)) extra.push(`user_id.eq.${q}`);
  const digits = (q ?? "").replace(/\D/g, "");
  if (digits.length >= 4 && digits !== q) extra.push(`phone.ilike.*${digits}*`);
  ops.push(...searchOp(q, ["display_name", "phone"], extra));

  const season = readOneOf(params, "season", MEMBERSHIP_SEASONS);
  if (season) {
    ops.push([
      "or",
      `current_season.eq.${season},next_season.eq.${season},pending_season.eq.${season}`,
    ]);
  }
  const bound = readExpiringBound(params, EXPIRING_WINDOWS);
  if (bound) {
    ops.push(["notnull", "coverage_expires_at"]);
    ops.push(["lte", "coverage_expires_at", bound]);
  }
  if (params.get("pending") === "1") ops.push(["notnull", "pending_id"]);
  if (withState) {
    const state = readOneOf(params, "state", MEMBERSHIP_STATES);
    if (state) ops.push(["eq", "state", state]);
  }
  return ops;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = req.nextUrl.searchParams;
  const db = createServiceClient();
  const ops = filterOps(params, true);

  if (params.get("ids") === "1") {
    const { data, count, error } = await applyOps(
      db.from(VIEW).select("user_id", { count: "exact" }),
      ops,
    )
      .order("user_id")
      .limit(ADMIN_STATUS_MAX_TARGETS);
    if (error) return errorResponse("server_error");
    if ((count ?? 0) > ADMIN_STATUS_MAX_TARGETS) {
      return json({ tooMany: true, count });
    }
    return json({
      ids: (data ?? []).map((row) => row.user_id).filter(Boolean),
      count,
    });
  }

  const page = readPage(params);
  const [from, to] = pageRange(page);
  const countOps = filterOps(params, false);
  const [list, counts, packages] = await Promise.all([
    applyOps(db.from(VIEW).select("*", { count: "exact" }), ops)
      .order("coverage_expires_at", { ascending: true, nullsFirst: false })
      .order("pending_created_at", { ascending: true, nullsFirst: false })
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("user_id")
      .range(from, to),
    Promise.all(
      MEMBERSHIP_STATES.map((state) =>
        applyOps(
          db.from(VIEW).select("user_id", { count: "exact", head: true }),
          [...countOps, ["eq", "state", state]],
        ),
      ),
    ),
    params.get("packages") === "1"
      ? db
          .from("pricing_packages")
          .select("id, code, name, label, is_enabled, sort_order, meta")
          .eq("category", "subscription")
          .eq("meta->>subscription_scope", "renter")
          .eq("meta->>billing_period", "seasonal")
          .not("meta->>season_start_month", "is", null)
          .order("sort_order")
      : Promise.resolve(null),
  ]);
  if (list.error || counts.some((c) => c.error) || packages?.error) {
    console.error(
      "[admin-statuses] membership list failed",
      list.error ?? counts.find((c) => c.error)?.error ?? packages?.error,
    );
    return errorResponse("server_error");
  }
  const stateCounts = Object.fromEntries(
    MEMBERSHIP_STATES.map((state, i) => [state, counts[i].count ?? 0]),
  );
  return json({
    rows: list.data ?? [],
    count: list.count ?? 0,
    page,
    pageSize: ADMIN_STATUS_PAGE_SIZE,
    stateCounts,
    ...(packages ? { packages: packages.data ?? [] } : {}),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  const parsed = parseMembershipChange(body, tbilisiToday());
  if (!parsed.ok) return errorResponse(parsed.error);
  const out = await runChange(
    "admin_change_memberships",
    guard.admin.userId,
    parsed.args,
  );
  if ("response" in out) return out.response;
  await revalidateCoveredRentals(out.result);
  return json(out.result);
}
