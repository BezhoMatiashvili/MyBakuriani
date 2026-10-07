"use client";

import { useTranslations } from "next-intl";
import DownloadMenu from "@/components/admin/DownloadMenu";
import {
  analyticsQueryToParams,
  type AnalyticsQuery,
  type ExportBlock,
  type ExportScope,
} from "@/lib/analytics/model";

/** Download link of one block (or the whole page) in one scope and format. */
export function analyticsExportHref(
  block: ExportBlock,
  scope: ExportScope,
  format: string,
  query: AnalyticsQuery,
): string {
  const params = analyticsQueryToParams(query);
  params.set("block", block);
  params.set("scope", scope);
  params.set("format", format);
  return `/api/admin/analytics/export?${params.toString()}`;
}

/**
 * Spec §11: every block exports its data filtered as on screen or for the same
 * period without filters, as Excel, CSV or PDF (C49).
 */
export default function ExportMenu({
  block,
  query,
  label,
  primary = false,
}: {
  block: ExportBlock;
  query: AnalyticsQuery;
  /** Visible text; the per-block menus say "Export". */
  label?: string;
  primary?: boolean;
}) {
  const t = useTranslations("AdminAnalytics");
  return (
    <DownloadMenu
      hrefFor={(scope, format) =>
        analyticsExportHref(block, scope, format, query)
      }
      ariaLabel={t("export.menuLabel", { block: t(`blocks.${block}`) })}
      testId={`analytics-export-${block}`}
      label={label}
      primary={primary}
    />
  );
}
