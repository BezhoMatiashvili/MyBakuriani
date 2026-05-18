import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { SENDER_ROLES, type SenderRole } from "@/lib/sms/audience";

export const runtime = "nodejs";

export type AutomationRules = {
  check_in_reminder_enabled: boolean;
  check_in_reminder_hours_before: number;
  review_request_enabled: boolean;
  review_request_hours_after: number;
  win_back_enabled: boolean;
  win_back_days_after: number;
};

const DEFAULTS: AutomationRules = {
  check_in_reminder_enabled: false,
  check_in_reminder_hours_before: 24,
  review_request_enabled: false,
  review_request_hours_after: 24,
  win_back_enabled: false,
  win_back_days_after: 90,
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
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
  if (!profile?.role || !SENDER_ROLES.has(profile.role as SenderRole)) {
    return { ok: false as const, status: 403, error: "role_not_allowed" };
  }
  return { ok: true as const, userId: user.id, role: profile.role };
}

export async function GET() {
  const guard = await requireSender();
  if (!guard.ok) {
    return Response.json({ error: guard.error }, { status: guard.status });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("sms_automation_rules")
    .select(
      "check_in_reminder_enabled, check_in_reminder_hours_before, review_request_enabled, review_request_hours_after, win_back_enabled, win_back_days_after",
    )
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

  const payload: AutomationRules = {
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
  };

  const db = createServiceClient();
  const { data, error } = await db
    .from("sms_automation_rules")
    .upsert({ user_id: guard.userId, ...payload }, { onConflict: "user_id" })
    .select(
      "check_in_reminder_enabled, check_in_reminder_hours_before, review_request_enabled, review_request_hours_after, win_back_enabled, win_back_days_after",
    )
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rules: data });
}
