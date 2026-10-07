"use client";

import { useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  type ExportFormat,
  type ExportScope,
} from "@/lib/analytics/model";

const ITEM =
  "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#1E293B] outline-none data-[highlighted]:bg-[#F1F5F9]";

/**
 * Fetches the file and saves it under the server's name. A refusal (429, 400,
 * 500) shows a toast instead: a plain `download` link would save the JSON
 * error body as the "file" without a word.
 */
async function saveExport(
  href: string,
): Promise<"ok" | "rate_limited" | "failed"> {
  try {
    const res = await fetch(href, { cache: "no-store" });
    if (!res.ok) return res.status === 429 ? "rate_limited" : "failed";
    const blob = await res.blob();
    const name =
      /filename="([^"]+)"/.exec(
        res.headers.get("Content-Disposition") ?? "",
      )?.[1] ?? "export";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking at once can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "ok";
  } catch {
    return "failed";
  }
}

/**
 * An admin export menu: the data filtered as on screen or for the same period
 * without filters, each as Excel, CSV or PDF (C49 analytics, C46 ad analytics).
 */
export default function DownloadMenu({
  hrefFor,
  ariaLabel,
  testId,
  label,
  primary = false,
  disabled = false,
}: {
  hrefFor: (scope: ExportScope, format: ExportFormat) => string;
  ariaLabel: string;
  /** Trigger test id; items get `<testId>-<scope>-<format>`. */
  testId: string;
  /** Visible text; defaults to "Export". */
  label?: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("AdminAnalytics");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  async function download(scope: ExportScope, format: ExportFormat) {
    // The trigger stays enabled (focus returns to it on close): ignore a
    // second pick while a file is still being built.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const result = await saveExport(hrefFor(scope, format));
    busyRef.current = false;
    setBusy(false);
    if (result === "rate_limited") toast.error(t("export.rateLimited"));
    else if (result === "failed") toast.error(t("export.failed"));
  }

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
        data-testid={testId}
        aria-label={ariaLabel}
        aria-busy={busy}
        disabled={disabled}
        className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          primary
            ? "bg-[#0F172A] text-white hover:bg-[#1E293B]"
            : "border border-[#E2E8F0] bg-[#F8FAFC] text-[#2563EB] hover:bg-[#EFF6FF]"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
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
            {EXPORT_SCOPES.map((scope, index) => (
              <Menu.Group key={scope}>
                {index > 0 ? (
                  <Menu.Separator className="my-1 h-px bg-[#E2E8F0]" />
                ) : null}
                <Menu.GroupLabel className="px-3 pb-1 pt-2 text-[11px] font-bold leading-4 text-[#64748B]">
                  {t(`export.${scope}`)}
                </Menu.GroupLabel>
                {EXPORT_FORMATS.map((format) => (
                  <Menu.Item
                    key={format}
                    className={ITEM}
                    onClick={() => void download(scope, format)}
                    data-testid={`${testId}-${scope}-${format}`}
                  >
                    {t(`export.${format}`)}
                  </Menu.Item>
                ))}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
