import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canUseSmsCenter } from "@/lib/sms/sender-access";

export const runtime = "nodejs";

export type AutomationRules = {
  check_in_reminder_enabled: boolean;
  check_in_reminder_hours_before: number;
  review_request_enabled: boolean;
  review_request_hours_after: number;
  win_back_enabled: boolean;
  win_back_days_after: number;
  // Owner-authored win-back promo text (spec section 3). NULL means "not set",
  // which is what the T3 fallback sentence in sms-automation-run branches on.
  win_back_discount_value: string | null;
  win_back_discount_period: string | null;
};

// The rules columns, listed once. Three call sites need this exact list — GET, the
// PUT's returning .select(), and the server page's own query in
// dashboard/sms/page.tsx. A column missing from any one of them is silently
// unreadable rather than an error.
const RULES_COLUMNS =
  "check_in_reminder_enabled, check_in_reminder_hours_before, review_request_enabled, review_request_hours_after, win_back_enabled, win_back_days_after, win_back_discount_value, win_back_discount_period";

const DEFAULTS: AutomationRules = {
  check_in_reminder_enabled: false,
  check_in_reminder_hours_before: 24,
  review_request_enabled: false,
  review_request_hours_after: 24,
  win_back_enabled: false,
  win_back_days_after: 90,
  win_back_discount_value: null,
  win_back_discount_period: null,
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// Trim, empty -> null, hard-slice to the column's CHECK length so a client cannot
// 500 the request on a constraint violation.
function normalizeDiscountText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

async function requireSender() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, status: 401, error: "unauthenticated" };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!(await canUseSmsCenter(supabase, user.id, profile?.role))) {
    return { ok: false as const, status: 403, error: "role_not_allowed" };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET() {
  const guard = await requireSender();
  if (!guard.ok) {
    return Response.json({ error: guard.error }, { status: guard.status });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("sms_automation_rules")
    .select(RULES_COLUMNS)
    .eq("user_id", guard.userId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: data ?? DEFAULTS });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSender();
  if (!guard.ok) {
    return Response.json({ error: guard.error }, { status: guard.status });
  }

  const body = (await req
    .json()
    .catch(() => null)) as Partial<AutomationRules> | null;
  if (!body) {
    return Response.json({ error: "bad_body" }, { status: 400 });
  }

  // The two discount fields are written ONLY when the client actually sent the key.
  // The PUT otherwise rebuilds `payload` from scratch, so a client bundle that predates
  // these fields (a cached page against a freshly deployed API) would send neither key
  // and silently null out whatever the owner had saved. Omitting a column from an
  // upsert's UPDATE branch preserves its stored value.
  //
  // Deliberately NOT a 400 when win_back_enabled is true and a field is blank: the
  // toggle's own debounced whole-object PUT always arrives before the user can type,
  // so rejecting would make the toggle itself unsettable. Required-ness is a UI
  // concern plus the server-side fallback template in sms-automation-run.
  const discountPatch: Partial<AutomationRules> = {};
  if ("win_back_discount_value" in body) {
    discountPatch.win_back_discount_value = normalizeDiscountText(
      body.win_back_discount_value,
      10,
    );
  }
  if ("win_back_discount_period" in body) {
    discountPatch.win_back_discount_period = normalizeDiscountText(
      body.win_back_discount_period,
      30,
    );
  }

  const payload = {
    check_in_reminder_enabled: Boolean(body.check_in_reminder_enabled),
    check_in_reminder_hours_before: clamp(
      Number(
        body.check_in_reminder_hours_before ??
          DEFAULTS.check_in_reminder_hours_before,
      ),
      1,
      168,
    ),
    review_request_enabled: Boolean(body.review_request_enabled),
    review_request_hours_after: clamp(
      Number(
        body.review_request_hours_after ?? DEFAULTS.review_request_hours_after,
      ),
      1,
      720,
    ),
    win_back_enabled: Boolean(body.win_back_enabled),
    win_back_days_after: clamp(
      Number(body.win_back_days_after ?? DEFAULTS.win_back_days_after),
      7,
      365,
    ),
    ...discountPatch,
  };

  const db = createServiceClient();
  const { data, error } = await db
    .from("sms_automation_rules")
    .upsert({ user_id: guard.userId, ...payload }, { onConflict: "user_id" })
    .select(RULES_COLUMNS)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: data });
}
