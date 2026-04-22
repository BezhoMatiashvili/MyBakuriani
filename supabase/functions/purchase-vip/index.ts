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

serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const body = await req.json().catch(() => ({}));
    const purchase_type = body.purchase_type as string | undefined;
    const property_id = body.property_id as string | null | undefined;
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
    });

    if (error) throw error;

    return jsonResponse({ data }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
