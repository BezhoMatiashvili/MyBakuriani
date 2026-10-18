import { requireUser } from "@/lib/auth/require-user";
import { COMPANY_TIERS } from "@/lib/org-tiers";
import { parsePurchaseIntent } from "@/lib/payments/keepz/intent";
import { checkRateLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Hands the owner the purchase their card top-up was for — exactly once. The
 * claim is a single conditional UPDATE, so two tabs (or a refresh) can never
 * both receive it and buy twice. The purchase itself then runs through the
 * unchanged purchase endpoints with the user's own session (C32).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return noStore({ error: "not_found" }, 404);
  if (
    !(await checkRateLimit(
      `keepz-resume:user:${guard.user.id}`,
      20,
      10 * 60_000,
    ))
  ) {
    return noStore({ error: "rate_limited" }, 429);
  }

  const { data, error } = await createServiceClient()
    .from("payments")
    .update({ resume_claimed_at: new Date().toISOString() })
    .eq("id", id.toLowerCase())
    .eq("user_id", guard.user.id)
    .eq("provider", "keepz")
    .eq("status", "succeeded")
    .is("resume_claimed_at", null)
    .not("resume", "is", null)
    .select("resume")
    .maybeSingle();
  if (error) {
    console.error(`[keepz] resume claim failed (${error.code})`);
    return noStore({ error: "resume_unavailable" }, 500);
  }
  const intent = data ? parsePurchaseIntent(data.resume, COMPANY_TIERS) : null;
  return intent
    ? noStore({ intent })
    : noStore({ error: "nothing_to_resume" }, 409);
}
