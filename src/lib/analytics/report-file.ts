import "server-only";
import type { ExportFormat } from "@/lib/analytics/model";
import type { AnalyticsReport } from "@/lib/analytics/report";
import { renderReportPdf } from "@/lib/finance/pdf";
import { buildXlsxWorkbook } from "@/lib/finance/xlsx";
import { toCsv } from "@/lib/security";

// One report (title, meta lines, titled tables) as a downloadable CSV, Excel
// or PDF file: the admin analytics export (C49) and the ad analytics export
// (C46) both answer through this.

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
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

/** The file as an attachment named `<fileStem>.<format>`, never cached. */
export async function reportFileResponse(
  report: AnalyticsReport,
  format: ExportFormat,
  pageLabel: (page: number, pages: number) => string,
): Promise<Response> {
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
        pageLabel,
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
}
