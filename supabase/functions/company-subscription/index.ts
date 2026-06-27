import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

// Activate a company subscription package (ENTRY / PRO / PREMIUM). The price and
// apartment cap are resolved server-side from pricing_packages by the RPC, and
// the owner's personal balance is debited atomically. Mirrors purchase-vip:
// requireUser validates the JWT, and user.id (never client input) is passed as
// the payer so a caller cannot charge someone else's balance.
type Tier = "entry" | "pro" | "premium";
const VALID_TIERS: readonly Tier[] = ["entry", "pro", "premium"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserCtx = Awaited<ReturnType<typeof requireUser>>;

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  let ctx: UserCtx | undefined;

  try {
    ctx = await requireUser(req);
    const { supabase, user } = ctx;

    const body = await req.json().catch(() => ({}));
    const org_id = body.org_id as string | undefined;
    const tier = body.tier as string | undefined;

    if (!org_id || !UUID_RE.test(org_id)) {
      throw new Error("არასწორი კომპანია");
    }
    if (!tier || !VALID_TIERS.includes(tier as Tier)) {
      throw new Error("არასწორი პაკეტი");
    }

    const { data, error } = await supabase.rpc(
      "purchase_company_subscription",
      {
        p_user_id: user.id,
        p_org_id: org_id,
        p_tier: tier,
      },
    );
    if (error) throw error;

    return jsonResponse({ data }, 200, cors);
  } catch (err) {
    // Best-effort failure notification (skipped when auth itself failed).
    if (ctx?.user?.id) {
      try {
        await ctx.supabase.from("notifications").insert({
          user_id: ctx.user.id,
          type: "payment_failed",
          title: "გადახდა ვერ შესრულდა",
          message: err instanceof Error ? err.message : "სცადეთ თავიდან.",
          action_url: "/dashboard/seller/organizations",
          severity: "warning",
        });
      } catch (_) {
        // ignore
      }
    }
    return errorResponse(err, cors);
  }
});
