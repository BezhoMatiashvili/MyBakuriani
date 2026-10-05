"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { ReportKey } from "@/lib/finance/constants";
import { downloadFile, useErrorText } from "./api";
import { Button } from "./ui";

// Excel / CSV / PDF of a register or report with the page's own filters
// (spec §13), from /api/admin/finance/export. Files are always Georgian.

const FORMATS = ["xlsx", "csv", "pdf"] as const;

export function exportUrl(
  report: ReportKey,
  format: (typeof FORMATS)[number],
  query: string,
): string {
  const params = new URLSearchParams(query);
  params.set("report", report);
  params.set("format", format);
  return `/api/admin/finance/export?${params.toString()}`;
}

export default function ExportButtons({
  report,
  query = "",
}: {
  report: ReportKey;
  /** Filters (and report parameters such as year or view) to export by. */
  query?: string;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: (typeof FORMATS)[number]) {
    setBusy(format);
    const failure = await downloadFile(exportUrl(report, format, query));
    setBusy(null);
    if (failure) toast.error(errorText(failure.code));
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t("export.label")}
    >
      {FORMATS.map((format) => (
        <Button
          key={format}
          loading={busy === format}
          disabled={busy !== null && busy !== format}
          icon={<Download className="h-4 w-4" aria-hidden />}
          onClick={() => download(format)}
        >
          {t(`export.${format}`)}
        </Button>
      ))}
    </div>
  );
}
