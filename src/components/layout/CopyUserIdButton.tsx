"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard is missing on a plain-http origin (a phone opening
    // the site by LAN address), so fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

interface CopyUserIdButtonProps {
  /** Display ID ("MB-XXXXX"); copied as is, without the "ID:" prefix. */
  userId: string;
  className?: string;
}

/**
 * Icon button that copies the account ID. The visible "ID: MB-XXXXX" line
 * stays with the caller; this button must never sit inside another button
 * (the sidebars pass it to CabinetSwitcher's `accessory` slot).
 */
export function CopyUserIdButton({ userId, className }: CopyUserIdButtonProps) {
  const t = useTranslations("DashboardSidebar");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copy() {
    const ok = await writeClipboard(userId);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setState("idle"), 1600);
  }

  const status =
    state === "copied"
      ? t("userIdCopied")
      : state === "failed"
        ? t("copyUserIdFailed")
        : "";

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t("copyUserId")}
        title={status || t("copyUserId")}
        data-jev-label={t("copyUserId")}
        data-testid="copy-user-id"
        className={cn(
          // 24px icon, 44px hit area through the ::after overlay.
          "relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[#2563EB] transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:bg-[#EFF6FF]",
          state === "failed" && "text-[#DC2626]",
          className,
        )}
      >
        {state === "copied" ? (
          <Check className="size-3.5" strokeWidth={2.5} />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </>
  );
}
