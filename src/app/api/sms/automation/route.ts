import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { canUseSmsCenter } from "@/lib/sms/sender-access";

export const runtime = "nodejs";

export type AutomationRules = {
  check_in_reminder_enabled: boolean;
  review_request_enabled: boolean;
  win_back_enabled: boolean;
  win_back_discount_value: string | null;
  win_back_discount_period: string | null;
};

// Public owner-facing columns only. Trigger timing remains fixed server-side.
const RULES_COLUMNS =
  "check_in_reminder_enabled, review_request_enabled, win_back_enabled, win_back_discount_value, win_back_discount_period";

const DEFAULTS: AutomationRules = {
  check_in_reminder_enabled: false,
  review_request_enabled: false,
  win_back_enabled: false,
  win_back_discount_value: null,
  win_back_discount_period: null,
};

// Trim, empty -> null, hard-slice to the column's CHECK length so a client cannot
// 500 the request on a constraint violation.
function normalizeDiscountText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? Array.from(trimmed).slice(0, max).join("") : null;
}

async function requireSender() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, status: 401, error: "unauthenticated" };
  }
  if (!(await canUseSmsCenter(supabase, user.id))) {
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

async function updateRules(req: NextRequest) {
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

  const payload: Partial<AutomationRules> = {};
  const booleanKeys = [
    "check_in_reminder_enabled",
    "review_request_enabled",
    "win_back_enabled",
  ] as const;
  for (const key of booleanKeys) {
    if (key in body) {
      if (typeof body[key] !== "boolean") {
        return Response.json({ error: "invalid_rule_value" }, { status: 400 });
      }
      payload[key] = body[key];
    }
  }
  if ("win_back_discount_value" in body) {
    payload.win_back_discount_value = normalizeDiscountText(
      body.win_back_discount_value,
      10,
    );
  }
  if ("win_back_discount_period" in body) {
    payload.win_back_discount_period = normalizeDiscountText(
      body.win_back_discount_period,
      30,
    );
  }

  if (Object.keys(payload).length === 0) {
    return Response.json({ error: "empty_patch" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: current, error: currentError } = await db
    .from("sms_automation_rules")
    .select(RULES_COLUMNS)
    .eq("user_id", guard.userId)
    .maybeSingle();

  if (currentError) {
    return Response.json({ error: currentError.message }, { status: 500 });
  }

  const next = { ...DEFAULTS, ...current, ...payload };
  // One database transaction changes the controls and retires already-queued
  // messages whose template/configuration is now stale. It shares the dispatch
  // advisory lock, so an old message cannot be claimed midway through the change.
  const { data, error } = await db.rpc("sms_set_automation_rules", {
    p_sender_id: guard.userId,
    p_check_in_enabled: next.check_in_reminder_enabled,
    p_review_enabled: next.review_request_enabled,
    p_win_back_enabled: next.win_back_enabled,
    p_discount_value: next.win_back_discount_value,
    p_discount_period: next.win_back_discount_period,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: data });
}

export async function PATCH(req: NextRequest) {
  return updateRules(req);
}

// Compatibility for already-open tabs running the former whole-object client.
export async function PUT(req: NextRequest) {
  return updateRules(req);
}
