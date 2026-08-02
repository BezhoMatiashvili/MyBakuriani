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

function normalizeDiscountText(value: unknown, max: number): string | null {
  if (value !== null && typeof value !== "string") {
    throw new TypeError("invalid_rule_value");
  }
  if (value === null) return null;
  const trimmed = value.trim();
  if (Array.from(trimmed).length > max) throw new RangeError("rule_too_long");
  return trimmed || null;
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

  const allowedKeys = new Set<keyof AutomationRules>([
    "check_in_reminder_enabled",
    "review_request_enabled",
    "win_back_enabled",
    "win_back_discount_value",
    "win_back_discount_period",
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key as keyof AutomationRules))) {
    return Response.json({ error: "unknown_rule_key" }, { status: 400 });
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
  try {
    if ("win_back_discount_value" in body) {
      payload.win_back_discount_value = normalizeDiscountText(body.win_back_discount_value, 10);
    }
    if ("win_back_discount_period" in body) {
      payload.win_back_discount_period = normalizeDiscountText(body.win_back_discount_period, 30);
    }
  } catch (error) {
    const code = error instanceof RangeError ? "rule_too_long" : "invalid_rule_value";
    return Response.json({ error: code }, { status: 400 });
  }

  if (Object.keys(payload).length === 0) {
    return Response.json({ error: "empty_patch" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("sms_patch_automation_rules", {
    p_sender_id: guard.userId,
    p_patch: payload,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: data });
}

export async function PATCH(req: NextRequest) {
  return updateRules(req);
}

export async function PUT() {
  return Response.json({ error: "use_partial_patch" }, { status: 410 });
}
