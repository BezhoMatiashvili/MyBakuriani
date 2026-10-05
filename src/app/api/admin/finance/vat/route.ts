import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { isIsoDate, tbilisiToday } from "@/lib/finance/filters";
import { thresholdStatus } from "@/lib/finance/money";
import { loadSettings } from "@/lib/finance/server/data";
import { financeErrorResponse } from "@/lib/finance/server/http";
import { loadVatWindow } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// GET /api/admin/finance/vat?as_of=YYYY-MM-DD — VAT watch (spec §10): the 12
// calendar months ending with as_of's month against the registration
// threshold (Tax Code art. 165), from finance_vat_window() (C42).
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const asOfParam = new URL(request.url).searchParams.get("as_of");
  const asOf = isIsoDate(asOfParam) ? asOfParam : tbilisiToday();
  const db = createServiceClient();
  try {
    const [vat, settings] = await Promise.all([
      loadVatWindow(db, asOf),
      loadSettings(db),
    ]);
    return Response.json({
      asOf,
      ...vat,
      warnPercent: settings.threshold_warning_percent,
      ...thresholdStatus(
        vat.turnover,
        vat.threshold,
        settings.threshold_warning_percent,
      ),
    });
  } catch (error) {
    return financeErrorResponse(error, `vat ${asOf}`);
  }
}
