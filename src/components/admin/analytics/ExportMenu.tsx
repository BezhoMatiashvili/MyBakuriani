"use client";

import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  analyticsQueryToParams,
  EXPORT_FORMATS,
  type AnalyticsQuery,
  type ExportBlock,
  type ExportScope,
} from "@/lib/analytics/model";

const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#1E293B] outline-none data-[highlighted]:bg-[#F1F5F9]";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scopes: ExportScope[] = ["filtered", "full"];

  return (
    <Menu.Root
      modal={false}
      onOpenChangeComplete={(open) => {
        if (open) return;
        // Base UI 1.3.0 can drop focus to <body> on Escape after an item
        // click (as in ShareMenu): put it back on the trigger.
        const active = document.activeElement;
        if (
          !active ||
          active === document.body ||
          popupRef.current?.contains(active)
        ) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <Menu.Trigger
        ref={triggerRef}
        data-testid={`analytics-export-${block}`}
        aria-label={t("export.menuLabel", { block: t(`blocks.${block}`) })}
        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition-colors ${
          primary
            ? "bg-[#0F172A] text-white hover:bg-[#1E293B]"
            : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#2563EB] hover:bg-[#EFF6FF]"
        }`}
      >
        <Download className="h-4 w-4" aria-hidden />
        {label ?? t("export.button")}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="isolate z-50 outline-none"
          align="end"
          sideOffset={8}
        >
          <Menu.Popup
            ref={popupRef}
            className="w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-2xl bg-white p-2 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] ring-1 ring-[#E2E8F0] outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            {scopes.map((scope, index) => (
              <Menu.Group key={scope}>
                {index > 0 ? (
                  <Menu.Separator className="my-1 h-px bg-[#E2E8F0]" />
                ) : null}
                <Menu.GroupLabel className="px-3 pb-1 pt-2 text-[11px] font-bold leading-4 text-[#64748B]">
                  {t(`export.${scope}`)}
                </Menu.GroupLabel>
                {EXPORT_FORMATS.map((format) => (
                  <Menu.LinkItem
                    key={format}
                    className={ITEM}
                    href={analyticsExportHref(block, scope, format, query)}
                    download
                    closeOnClick
                    data-testid={`analytics-export-${block}-${scope}-${format}`}
                  >
                    {t(`export.${format}`)}
                  </Menu.LinkItem>
                ))}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
