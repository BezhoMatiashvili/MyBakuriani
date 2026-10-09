import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { EXPORT_FORMATS, EXPORT_SCOPES, isOneOf } from "@/lib/analytics/model";
import { reportFileResponse } from "@/lib/analytics/report-file";
import { tbilisiDateTime } from "@/lib/finance/filters";
import { SMS_EXPORT_BLOCKS, parseSmsFilters } from "@/lib/finance/sms";
import { jsonError } from "@/lib/finance/server/http";
import {
  blockNeeds,
  buildSmsReport,
  loadSmsLedger,
  loadSmsPurchases,
  loadSmsSummary,
  smsExportRowLimit,
} from "@/lib/finance/server/sms";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// GET /api/admin/finance/sms/export?block=<SMS_EXPORT_BLOCKS>
//   &scope=filtered|full&format=xlsx|csv|pdf&from&to&type&status
// One block of the SMS control page (or the whole page) as Excel, CSV or PDF
// (C50, spec §8): filtered as on screen, or the same period without the type
// and status filters. Same SQL definitions as the page; always Georgian.
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const block = params.get("block");
  const scope = params.get("scope");
  const format = params.get("format");
  if (
    !isOneOf(SMS_EXPORT_BLOCKS, block) ||
    !isOneOf(EXPORT_SCOPES, scope) ||
    !isOneOf(EXPORT_FORMATS, format)
  ) {
    return jsonError("invalid_request", 400);
  }
  const parsed = parseSmsFilters(params);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (
    !(await checkRateLimit(
      `admin-sms-finance-export:${guard.admin.userId}`,
      60,
      600_000,
    ))
  ) {
    return jsonError("rate_limited", 429);
  }

  const filters =
    scope === "full"
      ? { ...parsed.filters, category: null, status: null }
      : parsed.filters;
  const needs = blockNeeds(block);

  try {
    const db = createServiceClient();
    const [summary, purchases, ledger] = await Promise.all([
      loadSmsSummary(db, filters),
      needs.purchases ? loadSmsPurchases(db) : Promise.resolve(null),
      needs.ledger
        ? loadSmsLedger(db, filters, smsExportRowLimit(format), 0)
        : Promise.resolve(null),
    ]);
    const t = await getTranslations({
      locale: "ka",
      namespace: "AdminSmsControl",
    });
    const tr = Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        t(key as never, values as never),
      { has: (key: string) => t.has(key as never) },
    );
    const report = buildSmsReport(
      { summary, purchases, ledger },
      {
        block,
        scope,
        format,
        filters,
        generatedAt: tbilisiDateTime(new Date().toISOString()),
      },
      tr,
    );
    return await reportFileResponse(report, format, (page, pages) =>
      t("export.page", { page, pages }),
    );
  } catch (error) {
    console.error(
      `GET /api/admin/finance/sms/export ${block}.${format} failed`,
      error instanceof Error ? error.message : error,
    );
    return jsonError("server_error", 500);
  }
}
