import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

type PurchaseType =
  | "vip_boost"
  | "super_vip"
  | "sms_package"
  | "discount_badge";

const VALID_TYPES: readonly PurchaseType[] = [
  "vip_boost",
  "super_vip",
  "sms_package",
  "discount_badge",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const package_id = body.package_id as string | undefined;
    const property_id = body.property_id as string | null | undefined;
    const service_id = body.service_id as string | null | undefined;

    // New path: caller specifies a pricing_packages.id. The RPC reads price
    // and category-specific behavior from the row, so admin-managed prices
    // and admin-added packages flow through without function changes.
    if (package_id) {
      if (!UUID_RE.test(package_id)) {
        throw new Error("არასწორი package_id");
      }
      const quantity = Number.isFinite(Number(body.quantity))
        ? Number(body.quantity)
        : 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 365) {
        throw new Error("არასწორი რაოდენობა");
      }

      const { data, error } = await supabase.rpc("purchase_package", {
        p_user_id: user.id,
        p_package_id: package_id,
        p_property_id: property_id ?? null,
        p_quantity: quantity,
      });
      if (error) throw error;
      return jsonResponse({ data }, 200, cors);
    }

    // Legacy path: fall back to the original hardcoded-type RPC so any
    // unmigrated callers keep working during rollout.
    const purchase_type = body.purchase_type as string | undefined;
    const days = Number.isFinite(Number(body.days)) ? Number(body.days) : 1;

    if (
      !purchase_type ||
      !VALID_TYPES.includes(purchase_type as PurchaseType)
    ) {
      throw new Error("არასწორი შეძენის ტიპი");
    }

    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("არასწორი დღეების რაოდენობა");
    }

    const { data, error } = await supabase.rpc("purchase_vip", {
      p_user_id: user.id,
      p_purchase_type: purchase_type,
      p_property_id: property_id ?? null,
      p_days: days,
      p_service_id: service_id ?? null,
    });

    if (error) throw error;

    return jsonResponse({ data }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
