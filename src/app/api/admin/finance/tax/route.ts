import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseYear, tbilisiToday } from "@/lib/finance/filters";
import { loadSettings } from "@/lib/finance/server/data";
import { financeErrorResponse } from "@/lib/finance/server/http";

export const runtime = "nodejs";

// GET /api/admin/finance/tax?year= — the tax period report (spec §7) and the
// small-business threshold (spec §9): finance_tax_year() per Tbilisi month,
// with the settings the calculator (spec §8) starts from (C42).
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const today = tbilisiToday();
  const year = parseYear(
    new URL(request.url).searchParams.get("year"),
    Number(today.slice(0, 4)),
  );
  const db = createServiceClient();
  try {
    const [{ data, error }, settings] = await Promise.all([
      db.rpc("finance_tax_year", { p_year: year }),
      loadSettings(db),
    ]);
    if (error) throw error;
    return Response.json({
      year,
      today,
      rows: data ?? [],
      settings: {
        rate: settings.small_business_rate,
        highRate: settings.small_business_high_rate,
        threshold: settings.small_business_threshold,
        warnPercent: settings.threshold_warning_percent,
      },
    });
  } catch (error) {
    return financeErrorResponse(error, `tax ${year}`);
  }
}
