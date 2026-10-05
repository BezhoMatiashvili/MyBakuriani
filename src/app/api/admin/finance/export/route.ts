import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { toCsv } from "@/lib/security";
import { isOneOf } from "@/lib/finance/constants";
import { buildXlsx } from "@/lib/finance/xlsx";
import { renderTablePdf } from "@/lib/finance/pdf";
import { financeT } from "@/lib/finance/server/labels";
import { financeErrorResponse, jsonError } from "@/lib/finance/server/http";
import { REPORT_KEYS, buildReport } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// GET /api/admin/finance/export?report=<key>&format=csv|xlsx|pdf&<filters>
// Spec §13: every register and report as Excel/CSV and PDF (C42). The rows
// come from the same reads as the register pages, in Georgian.

const FORMATS = ["csv", "xlsx", "pdf"] as const;
// pdf-lib holds every page until it saves: 1000 rows take about 2 s and
// 180 MB, 5000 rows 10 s and 450 MB. Longer lists go to Excel or CSV.
const MAX_PDF_ROWS = 1000;

const CONTENT_TYPES: Record<(typeof FORMATS)[number], string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const report = params.get("report");
  const format = params.get("format");
  if (!isOneOf(REPORT_KEYS, report) || !isOneOf(FORMATS, format)) {
    return jsonError("invalid_request", 400);
  }
  const allowed = await checkRateLimit(
    `finance-export:admin:${guard.admin.userId}`,
    60,
    600_000,
  );
  if (!allowed) return jsonError("rate_limited", 429);

  try {
    const t = await financeT();
    const built = await buildReport(createServiceClient(), report, params, t);

    let body: Uint8Array<ArrayBuffer> | string;
    if (format === "csv") {
      // A CSV stays a plain table (no title lines or totals) so it imports
      // cleanly; the BOM makes Excel read it as UTF-8.
      body = `﻿${toCsv([built.columns.map((c) => c.header), ...built.rows])}`;
    } else if (format === "xlsx") {
      body = new Uint8Array(
        buildXlsx({
          sheetName: built.title,
          preamble: [
            built.title,
            ...built.meta,
            ...(built.footnote ? [built.footnote] : []),
          ],
          columns: built.columns.map((c) => ({
            header: c.header,
            kind: c.kind,
          })),
          rows: built.totals ? [...built.rows, built.totals] : built.rows,
        }),
      );
    } else {
      const cut = built.rows.length > MAX_PDF_ROWS;
      body = new Uint8Array(
        await renderTablePdf({
          title: built.title,
          meta: cut
            ? [...built.meta, t("export.pdfTruncated", { count: MAX_PDF_ROWS })]
            : built.meta,
          columns: built.columns,
          rows: cut ? built.rows.slice(0, MAX_PDF_ROWS) : built.rows,
          totals: cut ? null : built.totals,
          footnote: built.footnote,
          pageLabel: (page, pages) => t("export.page", { page, pages }),
        }),
      );
    }

    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${built.fileStem}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return financeErrorResponse(error, `export ${report}.${format}`);
  }
}
