import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_SMS_UNITS } from "@/lib/finance/sms";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readJsonObject,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// PATCH /api/admin/finance/sms/settings {threshold} — the low-balance
// warning's threshold in SMS units (C50, spec §7). Saving re-arms the warning:
// finance_set_sms_low_balance() clears the sent mark and checks at once.
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    const threshold = Number(body.threshold);
    if (
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > MAX_SMS_UNITS
    ) {
      throw new FinanceInputError("invalid_threshold");
    }
    const { data, error } = await createServiceClient(guard.admin.userId).rpc(
      "finance_set_sms_low_balance",
      { p_actor: guard.admin.userId, p_units: threshold },
    );
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return financeErrorResponse(error, "sms settings");
  }
}
