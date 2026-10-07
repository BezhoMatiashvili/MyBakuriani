import { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { cityDisplayName } from "@/lib/analytics/cities";
import {
  EXPORT_BLOCKS,
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  isOneOf,
  parseAnalyticsQuery,
  previousRange,
  tbilisiDateTime,
  withoutDimensions,
  type DataBlock,
  type ExportBlock,
  type ExportFormat,
} from "@/lib/analytics/model";
import {
  buildAnalyticsReport,
  type AnalyticsReport,
  type ReportInput,
  type ReportLabels,
} from "@/lib/analytics/report";
import { loadAnalyticsBlock } from "@/lib/analytics/server";
import { renderReportPdf } from "@/lib/finance/pdf";
import { buildXlsxWorkbook } from "@/lib/finance/xlsx";
import { checkRateLimit } from "@/lib/rateLimit";
import { toCsv } from "@/lib/security";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/admin/analytics/export?block=<EXPORT_BLOCKS>&scope=filtered|full
//   &format=xlsx|csv|pdf&<the dashboard query>
// Spec §11: every block (and the whole page) as Excel, CSV or PDF, either as
// filtered on screen or the same period without filters. Same parser and SQL
// functions as the page (C49); the file states the period, the comparison,
// every active filter and when it was generated. Always Georgian, like the
// finance exports (C42).

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

const BLOCK_DATA: Record<ExportBlock, DataBlock[]> = {
  kpis: ["traffic"],
  chart: ["traffic"],
  sources: ["traffic"],
  listings: ["listings"],
  smartmatch: ["smartmatch"],
  ads: ["ads"],
  live: ["live"],
  all: ["traffic", "listings", "smartmatch", "ads", "live"],
};

const BOM = String.fromCharCode(0xfeff);

function reportCsv(report: AnalyticsReport): string {
  const rows: unknown[][] = [[report.title], ...report.meta.map((l) => [l])];
  for (const section of report.sections) {
    rows.push(
      [],
      [section.title],
      section.columns.map((c) => c.header),
      ...section.rows,
      ...section.notes.map((n) => [n]),
    );
  }
  // Every line, the title and meta lines included, goes through toCsv's
  // formula neutralisation. The BOM makes Excel read it as UTF-8.
  return `${BOM}${toCsv(rows)}`;
}

function reportXlsx(report: AnalyticsReport): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    buildXlsxWorkbook(
      report.sections.map((section, i) => ({
        sheetName: `${i + 1}. ${section.title}`,
        // Each sheet carries the period, filters and generated date.
        preamble: [
          report.title,
          ...report.meta,
          section.title,
          ...section.notes,
        ],
        columns: section.columns.map((c) => ({
          header: c.header,
          kind: c.kind,
        })),
        rows: section.rows,
      })),
    ),
  );
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const block = params.get("block");
  const scope = params.get("scope");
  const format = params.get("format");
  if (
    !isOneOf(EXPORT_BLOCKS, block) ||
    !isOneOf(EXPORT_SCOPES, scope) ||
    !isOneOf(EXPORT_FORMATS, format)
  ) {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    !(await checkRateLimit(
      `admin-analytics-export:${guard.admin.userId}`,
      60,
      600_000,
    ))
  ) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = parseAnalyticsQuery(params);
  const query = scope === "full" ? withoutDimensions(parsed) : parsed;

  try {
    const db = createServiceClient();
    const input: ReportInput = {
      block,
      scope,
      query,
      previousRange: query.compare ? previousRange(query.range) : null,
      generatedAt: tbilisiDateTime(),
    };
    await Promise.all(
      BLOCK_DATA[block].map(async (dataBlock) => {
        switch (dataBlock) {
          case "traffic":
            input.traffic = await loadAnalyticsBlock(db, "traffic", query);
            break;
          case "listings":
            input.listings = await loadAnalyticsBlock(db, "listings", query);
            break;
          case "smartmatch":
            input.smartmatch = await loadAnalyticsBlock(
              db,
              "smartmatch",
              query,
            );
            break;
          case "ads":
            input.ads = await loadAnalyticsBlock(db, "ads", query);
            break;
          case "live":
            input.live = (await loadAnalyticsBlock(db, "live", query)).current;
            break;
        }
      }),
    );

    const t = await getTranslations({
      locale: "ka",
      namespace: "AdminAnalytics",
    });
    const tShared = await getTranslations({
      locale: "ka",
      namespace: "AdminShared",
    });
    const regions = new Intl.DisplayNames(["ka"], { type: "region" });
    const labels: ReportLabels = {
      t: (key, values) => t(key as never, values as never),
      placement: (id) =>
        tShared.has(`placements.${id}` as never)
          ? tShared(`placements.${id}` as never)
          : id,
      country: (code) => {
        try {
          return regions.of(code) ?? code;
        } catch {
          return code;
        }
      },
      city: (name) => cityDisplayName(name, "ka"),
    };
    const report = buildAnalyticsReport(input, labels);

    let body: string | Uint8Array<ArrayBuffer>;
    if (format === "csv") {
      body = reportCsv(report);
    } else if (format === "xlsx") {
      body = reportXlsx(report);
    } else {
      body = new Uint8Array(
        await renderReportPdf({
          title: report.title,
          meta: report.meta,
          sections: report.sections,
          pageLabel: (page, pages) => t("export.page", { page, pages }),
          footer: report.stamp,
        }),
      );
    }

    return new Response(body, {
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${report.fileStem}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      `GET /api/admin/analytics/export ${block}.${format} failed`,
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
