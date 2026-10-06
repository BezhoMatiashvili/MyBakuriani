import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ADMIN_STATUS_MAX_TARGETS,
  ADMIN_STATUS_PAGE_SIZE,
  EXPIRING_WINDOWS,
  LISTING_CATEGORIES,
  LISTING_STATUSES,
  PROMOTION_FILTERS,
  isUuid,
  parseListingChange,
  tbilisiToday,
  type PromotionFilter,
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
  revalidatePromotedListings,
  runChange,
  searchOp,
  type Op,
} from "@/lib/admin-statuses-server";

// Admin VIP / SUPER VIP / discount management (C44): GET lists
// admin_listing_promotions_v (properties + services) with filters, promotion
// counts and the select-all target list; POST previews or applies one
// admin_change_listing_promotions call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW = "admin_listing_promotions_v";

const PROMO_OPS: Record<PromotionFilter, Op[]> = {
  super: [["eq", "vip_tier", "super"]],
  vip: [["eq", "vip_tier", "vip"]],
  discount: [["eq", "discount_active", true]],
  none: [
    ["isnull", "vip_tier"],
    ["eq", "discount_active", false],
  ],
  permanent: [["or", "vip_permanent.is.true,discount_permanent.is.true"]],
};

function filterOps(params: URLSearchParams, withPromo: boolean): Op[] {
  const ops: Op[] = [];
  const q = readSearch(params);
  const extra = isUuid(q) ? [`id.eq.${q}`, `owner_id.eq.${q}`] : [];
  ops.push(...searchOp(q, ["title", "owner_name", "owner_phone"], extra));

  const owner = params.get("owner");
  if (isUuid(owner)) ops.push(["eq", "owner_id", owner]);
  const kind = readOneOf(params, "kind", ["property", "service"] as const);
  if (kind) ops.push(["eq", "kind", kind]);
  const category = readOneOf(params, "category", LISTING_CATEGORIES);
  if (category) ops.push(["eq", "category", category]);
  const status = readOneOf(params, "status", LISTING_STATUSES);
  if (status) ops.push(["eq", "status", status]);

  const bound = readExpiringBound(params, EXPIRING_WINDOWS);
  if (bound) {
    ops.push([
      "or",
      `and(vip_tier.not.is.null,vip_expires_at.lte."${bound}"),` +
        `and(discount_active.is.true,discount_expires_at.lte."${bound}")`,
    ]);
  }
  if (withPromo) {
    const promo = readOneOf(params, "promo", PROMOTION_FILTERS);
    if (promo) ops.push(...PROMO_OPS[promo]);
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
      db.from(VIEW).select("kind, id", { count: "exact" }),
      ops,
    )
      .order("id")
      .limit(ADMIN_STATUS_MAX_TARGETS);
    if (error) return errorResponse("server_error");
    if ((count ?? 0) > ADMIN_STATUS_MAX_TARGETS) {
      return json({ tooMany: true, count });
    }
    return json({
      targets: (data ?? []).filter((row) => row.kind && row.id),
      count,
    });
  }

  const page = readPage(params);
  const [from, to] = pageRange(page);
  const countOps = filterOps(params, false);
  const [list, counts] = await Promise.all([
    applyOps(db.from(VIEW).select("*", { count: "exact" }), ops)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to),
    Promise.all(
      PROMOTION_FILTERS.map((promo) =>
        applyOps(db.from(VIEW).select("id", { count: "exact", head: true }), [
          ...countOps,
          ...PROMO_OPS[promo],
        ]),
      ),
    ),
  ]);
  if (list.error || counts.some((c) => c.error)) {
    console.error(
      "[admin-statuses] listing list failed",
      list.error ?? counts.find((c) => c.error)?.error,
    );
    return errorResponse("server_error");
  }
  const promoCounts = Object.fromEntries(
    PROMOTION_FILTERS.map((promo, i) => [promo, counts[i].count ?? 0]),
  );
  return json({
    rows: list.data ?? [],
    count: list.count ?? 0,
    page,
    pageSize: ADMIN_STATUS_PAGE_SIZE,
    promoCounts,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  const parsed = parseListingChange(body, tbilisiToday());
  if (!parsed.ok) return errorResponse(parsed.error);
  const out = await runChange(
    "admin_change_listing_promotions",
    guard.admin.userId,
    parsed.args,
  );
  if ("response" in out) return out.response;
  revalidatePromotedListings(out.result);
  return json(out.result);
}
