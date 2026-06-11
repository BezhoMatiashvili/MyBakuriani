import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BONUS_GEL = 10000;

// Admin grants a balance bonus to a client. Reuses the atomic topup_balance
// RPC, which credits the balance, logs a `topup` transaction and notifies the
// user in-app — the description marks it as an admin bonus.
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    user_id?: string;
    amount?: number;
    comment?: string;
  } | null;

  if (!body?.user_id) {
    return Response.json({ error: "user_id required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BONUS_GEL) {
    return Response.json(
      { error: `amount must be between 0 and ${MAX_BONUS_GEL}` },
      { status: 400 },
    );
  }

  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const description = comment
    ? `ბონუსი ადმინისტრატორისგან: ${comment}`
    : "ბონუსი ადმინისტრატორისგან";

  const db = createServiceClient();
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
