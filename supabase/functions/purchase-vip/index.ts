import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  ApiError,
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UserCtx = Awaited<ReturnType<typeof requireUser>>;

/**
 * A user-actionable purchase outcome. `reason` is a stable ASCII token the
 * client maps to localized copy; `message` stays the Georgian text that older
 * clients render as-is.
 */
class PurchaseError extends ApiError {
  reason: string;
  constructor(message: string, reason: string, status = 400) {
    super(message, status, "BAD_REQUEST");
    this.reason = reason;
  }
}

// purchase_package tags every user-facing RAISE with one of these HINTs.
const RPC_REASON_STATUS: Record<string, number> = {
  insufficient_balance: 400,
  invalid_quantity: 400,
  invalid_discount_percent: 400,
  invalid_target: 400,
  package_unavailable: 400,
  not_owner: 403,
};

// These are intentional, user-actionable purchase outcomes. Keep the rest of
// the database error surface private (errorResponse's default behaviour).
function userSafePurchaseError(error: { message?: string; hint?: string }) {
  const message = error.message ?? "";
  if (message.includes("vip_tier_conflict")) {
    return new PurchaseError("vip_tier_conflict", "vip_tier_conflict", 409);
  }
  const hint = error.hint ?? "";
  if (Object.hasOwn(RPC_REASON_STATUS, hint)) {
    return new PurchaseError(message, hint, RPC_REASON_STATUS[hint]);
  }
  if (
    message.includes("არასაკმარისი ბალანსი") ||
    message.includes("პაკეტი არ არის ხელმისაწვდომი")
  ) {
    return new ApiError(message, 400, "BAD_REQUEST");
  }
  if (message.includes("MEMBERSHIP_ALREADY_PENDING")) {
    return new ApiError(
      "Membership payment is already awaiting admin approval.",
      409,
      "BAD_REQUEST",
    );
  }
  if (message.includes("MEMBERSHIP_ALREADY_ACTIVE")) {
    return new ApiError(
      "A seasonal membership is already active.",
      409,
      "BAD_REQUEST",
    );
  }
  if (message.includes("MEMBERSHIP_FB_PROFILE_REQUIRED")) {
    return new ApiError(
      "A Facebook profile link is required for this membership tier.",
      400,
      "BAD_REQUEST",
    );
  }
  if (
    message.includes("MEMBERSHIP_PACKAGE_NOT_FOUND") ||
    message.includes("MEMBERSHIP_PACKAGE_DISABLED") ||
    message.includes("MEMBERSHIP_PACKAGE_NOT_SEASONAL")
  ) {
    return new ApiError(
      "This seasonal membership package is not available.",
      400,
      "BAD_REQUEST",
    );
  }
  return error;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Hoisted so the catch block can notify the user of a failed payment.
  let ctx: UserCtx | undefined;
  let dashboardScope: string | null = null;

  try {
    ctx = await requireUser(req);
    const { supabase, user } = ctx;

    const body = await req.json().catch(() => ({}));
    const package_id = body.package_id as string | undefined;
    const property_id = body.property_id as string | null | undefined;
    const service_id = body.service_id as string | null | undefined;

    // A failure still belongs to the cabinet that owns the selected listing.
    // Resolve only against the authenticated owner's rows, never client labels.
    if (property_id) {
      const { data } = await supabase
        .from("properties")
        .select("is_for_sale")
        .eq("id", property_id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (data) dashboardScope = data.is_for_sale ? "seller" : "renter";
    } else if (service_id) {
      const { data } = await supabase
        .from("services")
        .select("category")
        .eq("id", service_id)
        .eq("owner_id", user.id)
        .maybeSingle();
      switch (data?.category) {
        case "food":
          dashboardScope = "food";
          break;
        case "cleaning":
          dashboardScope = "cleaner";
          break;
        case "employment":
        case "transport":
        case "entertainment":
          dashboardScope = data.category;
          break;
        case "handyman":
          dashboardScope = "services";
          break;
      }
    }

    // New path: caller specifies a pricing_packages.id. The RPC reads price
    // and category-specific behavior from the row, so admin-managed prices
    // and admin-added packages flow through without function changes.
    if (package_id) {
      if (!UUID_RE.test(package_id)) {
        throw new PurchaseError("არასწორი package_id", "package_unavailable");
      }
      const quantity = Number.isFinite(Number(body.quantity))
        ? Number(body.quantity)
        : 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 365) {
        throw new PurchaseError("არასწორი რაოდენობა", "invalid_quantity");
      }

      const discount_percent = Number.isFinite(Number(body.discount_percent))
        ? Number(body.discount_percent)
        : null;
      if (
        discount_percent !== null &&
        (!Number.isInteger(discount_percent) ||
          discount_percent < 1 ||
          discount_percent > 90)
      ) {
        throw new PurchaseError(
          "არასწორი ფასდაკლების პროცენტი",
          "invalid_discount_percent",
        );
      }

      // Renter membership has a stricter lifecycle than every other package:
      // wallet payment creates a seasonal pending request and only an admin can
      // activate it. Resolve package metadata server-side so a caller cannot
      // bypass that lifecycle by omitting a client-supplied flag.
      const { data: selectedPackage, error: packageError } = await supabase
        .from("pricing_packages")
        .select("category, meta")
        .eq("id", package_id)
        .maybeSingle();
      if (packageError) throw packageError;

      const packageMeta = selectedPackage?.meta as
        Record<string, unknown> | null | undefined;
      const isRenterMembership =
        selectedPackage?.category === "subscription" &&
        packageMeta?.subscription_scope === "renter";

      if (isRenterMembership) {
        if (quantity !== 1 || property_id || service_id) {
          throw new ApiError(
            "Seasonal membership is account-wide and can only be purchased once.",
            400,
            "BAD_REQUEST",
          );
        }
        // FB-group-VIP is self-declared: 30 ₾ instead of 60 ₾ in exchange for a
        // link the admin can open to check the claim (mirrored by
        // purchase_renter_membership's own https-only guard).
        const fb_profile_url =
          typeof body.fb_profile_url === "string"
            ? body.fb_profile_url.trim()
            : "";
        if (
          packageMeta?.price_tier === "fb_group_vip" &&
          (fb_profile_url.length > 300 || !/^https:\/\//i.test(fb_profile_url))
        ) {
          // Same message the RPC's own MEMBERSHIP_FB_PROFILE_REQUIRED guard
          // maps to below — PaymentModal.tsx matches on this exact English
          // text (EDGE_ERROR_KEYS), same convention as the other membership
          // outcomes (already-pending/already-active/unavailable).
          throw new ApiError(
            "A Facebook profile link is required for this membership tier.",
            400,
            "BAD_REQUEST",
          );
        }
        const { data, error } = await supabase.rpc(
          "purchase_renter_membership",
          {
            p_user_id: user.id,
            p_package_id: package_id,
            p_fb_profile_url: fb_profile_url || null,
          },
        );
        if (error) throw userSafePurchaseError(error);
        return jsonResponse({ data }, 200, cors);
      }

      const { data, error } = await supabase.rpc("purchase_package", {
        p_user_id: user.id,
        p_package_id: package_id,
        p_property_id: property_id ?? null,
        p_service_id: service_id ?? null,
        p_quantity: quantity,
        p_discount_percent: discount_percent,
      });
      if (error) throw userSafePurchaseError(error);
      return jsonResponse({ data }, 200, cors);
    }

    // The legacy `purchase_type` path (purchase_vip RPC) is retired: it used
    // hardcoded prices that ignored admin pricing/is_enabled, and its discount
    // branch never set discount_expires_at, so a 1 ₾ badge never expired. Every
    // client sends package_id.
    throw new ApiError("არასწორი შეძენის ტიპი", 400, "BAD_REQUEST");
  } catch (err) {
    // Best-effort failure notification. Skipped when auth itself failed
    // (no user/client). Swallow any insert error so the real error surfaces.
    if (ctx?.user?.id) {
      try {
        await ctx.supabase.from("notifications").insert({
          user_id: ctx.user.id,
          type: "payment_failed",
          title: "გადახდა ვერ შესრულდა",
          message:
            err instanceof Error && err.message === "vip_tier_conflict"
              ? "სტანდარტული VIP მიუწვდომელია, სანამ SUPER VIP აქტიურია."
              : err instanceof ApiError
                ? err.message
                : "სცადეთ თავიდან.",
          action_url: "/dashboard",
          severity: "warning",
          dashboard_scope: dashboardScope,
        });
      } catch (_) {
        // ignore
      }
    }
    if (err instanceof PurchaseError) {
      return jsonResponse(
        { error: err.message, code: err.code, reason: err.reason },
        err.status,
        cors,
      );
    }
    return errorResponse(err, cors);
  }
});
