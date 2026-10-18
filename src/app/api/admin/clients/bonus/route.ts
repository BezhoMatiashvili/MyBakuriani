import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BONUS_GEL = 10000;
const MAX_GIFT_SMS_CREDITS = 10000;
const MAX_COMMENT = 300;

// Admin grants a client a balance bonus (kind "balance", the default) or SMS
// credits (kind "sms"). The balance bonus reuses the atomic topup_balance RPC,
// which credits the balance, logs a `topup` transaction and notifies the user
// in-app — the description marks it as an admin bonus. SMS credits go through
// admin_gift_sms_credits: no transaction (no money moves), a bell-only notice
// (C44).
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    user_id?: string;
    kind?: string;
    amount?: number;
    credits?: number;
    comment?: string;
  } | null;

  if (!body?.user_id) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }
  const kind = body.kind ?? "balance";
  if (kind !== "balance" && kind !== "sms") {
    return Response.json(
      { error: "kind must be balance or sms" },
      { status: 400 },
    );
  }
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (comment.length > MAX_COMMENT) {
    return Response.json(
      { error: `comment must be at most ${MAX_COMMENT} characters` },
      { status: 400 },
    );
  }
  const db = createServiceClient(guard.admin.userId);

  if (kind === "sms") {
    const credits = Number(body.credits);
    if (
      !Number.isInteger(credits) ||
      credits < 1 ||
      credits > MAX_GIFT_SMS_CREDITS
    ) {
      return Response.json(
        {
          error: `credits must be a whole number from 1 to ${MAX_GIFT_SMS_CREDITS}`,
        },
        { status: 400 },
      );
    }
    const { data, error } = await db.rpc("admin_gift_sms_credits", {
      p_admin_id: guard.admin.userId,
      p_user_id: body.user_id,
      p_credits: credits,
      p_note: comment || undefined,
    });
    if (error) {
      return Response.json(
        { error: error.message },
        { status: error.code === "P0002" ? 404 : 500 },
      );
    }
    return Response.json({ ok: true, sms_remaining: Number(data ?? 0) });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BONUS_GEL) {
    return Response.json(
      { error: `amount must be between 0 and ${MAX_BONUS_GEL}` },
      { status: 400 },
    );
  }

  const description = comment
    ? `ბონუსი ადმინისტრატორისგან: ${comment}`
    : "ბონუსი ადმინისტრატორისგან";

  const { data, error } = await db.rpc("topup_balance", {
    p_user_id: body.user_id,
    p_amount: amount,
    p_description: description,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, new_balance: Number(data ?? 0) });
}
