import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ADMIN_STATUS_MAX_TARGETS,
  ADMIN_STATUS_PAGE_SIZE,
  COMPANY_PLAN_TIERS,
  COMPANY_STATES,
  EXPIRING_WINDOWS,
  isUuid,
  parseCompanyChange,
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
  revalidateCompanyLinks,
  runChange,
  searchOp,
  type Op,
} from "@/lib/admin-statuses-server";

// Admin company plan management (C44): GET lists admin_company_plans_v with
// filters, state counts and the select-all id list; POST previews or applies
// one admin_change_company_plans call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW = "admin_company_plans_v";

function filterOps(params: URLSearchParams, withState: boolean): Op[] {
  const ops: Op[] = [];
  const q = readSearch(params);
  const extra = isUuid(q)
    ? [`organization_id.eq.${q}`, `owner_id.eq.${q}`]
    : [];
  ops.push(
    ...searchOp(
      q,
      ["brand_name", "legal_name", "owner_name", "owner_phone"],
      extra,
    ),
  );
  const tier = readOneOf(params, "tier", COMPANY_PLAN_TIERS);
  if (tier) ops.push(["eq", "tier", tier]);
  const orgStatus = params.get("orgStatus");
  if (orgStatus === "active") ops.push(["eq", "org_status", "active"]);
  const bound = readExpiringBound(params, EXPIRING_WINDOWS);
  if (bound) {
    ops.push(["notnull", "plan_id"]);
    ops.push(["lte", "expires_at", bound]);
  }
  if (withState) {
    const state = readOneOf(params, "state", COMPANY_STATES);
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
      db.from(VIEW).select("organization_id", { count: "exact" }),
      ops,
    )
      .order("organization_id")
      .limit(ADMIN_STATUS_MAX_TARGETS);
    if (error) return errorResponse("server_error");
    if ((count ?? 0) > ADMIN_STATUS_MAX_TARGETS) {
      return json({ tooMany: true, count });
    }
    return json({
      ids: (data ?? []).map((row) => row.organization_id).filter(Boolean),
      count,
    });
  }

  const page = readPage(params);
  const [from, to] = pageRange(page);
  const countOps = filterOps(params, false);
  const [list, counts, tiers] = await Promise.all([
    applyOps(db.from(VIEW).select("*", { count: "exact" }), ops)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .order("brand_name", { ascending: true, nullsFirst: false })
      .order("organization_id")
      .range(from, to),
    Promise.all(
      COMPANY_STATES.map((state) =>
        applyOps(
          db
            .from(VIEW)
            .select("organization_id", { count: "exact", head: true }),
          [...countOps, ["eq", "state", state]],
        ),
      ),
    ),
    params.get("packages") === "1"
      ? db
          .from("pricing_packages")
          .select("code, name, label, is_enabled, meta")
          .in(
            "code",
            COMPANY_PLAN_TIERS.map((tier) => `company-${tier}`),
          )
          .order("sort_order")
      : Promise.resolve(null),
  ]);
  if (list.error || counts.some((c) => c.error) || tiers?.error) {
    console.error(
      "[admin-statuses] company list failed",
      list.error ?? counts.find((c) => c.error)?.error ?? tiers?.error,
    );
    return errorResponse("server_error");
  }
  const stateCounts = Object.fromEntries(
    COMPANY_STATES.map((state, i) => [state, counts[i].count ?? 0]),
  );
  return json({
    rows: list.data ?? [],
    count: list.count ?? 0,
    page,
    pageSize: ADMIN_STATUS_PAGE_SIZE,
    stateCounts,
    ...(tiers ? { tiers: tiers.data ?? [] } : {}),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  const parsed = parseCompanyChange(body, tbilisiToday());
  if (!parsed.ok) return errorResponse(parsed.error);
  const out = await runChange(
    "admin_change_company_plans",
    guard.admin.userId,
    parsed.args,
  );
  if ("response" in out) return out.response;
  revalidateCompanyLinks(out.result);
  return json(out.result);
}
