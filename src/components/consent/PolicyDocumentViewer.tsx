"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { routing, type AppLocale } from "@/i18n/routing";
import type { LegalDoc } from "@/content/legal/types";
import LegalDocumentView from "@/components/legal/LegalDocumentView";

export type PolicyKey = "terms" | "privacy" | "marketing";

const POLICY_PATHS: Record<PolicyKey, string> = {
  terms: "/terms",
  privacy: "/privacy",
  marketing: "/marketing-policy",
};

export function policyHref(policy: PolicyKey, locale: AppLocale) {
  const path = POLICY_PATHS[policy];
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

// One chunk per document and locale, fetched on first open. ConsentGate loads
// on every page, and the nine texts together are ~270 KB.
const LOADERS: Record<PolicyKey, Record<AppLocale, () => Promise<LegalDoc>>> = {
  terms: {
    ka: () => import("@/content/legal/terms.ka").then((m) => m.termsKa),
    en: () => import("@/content/legal/terms.en").then((m) => m.termsEn),
    ru: () => import("@/content/legal/terms.ru").then((m) => m.termsRu),
  },
  privacy: {
    ka: () => import("@/content/legal/privacy.ka").then((m) => m.privacyKa),
    en: () => import("@/content/legal/privacy.en").then((m) => m.privacyEn),
    ru: () => import("@/content/legal/privacy.ru").then((m) => m.privacyRu),
  },
  marketing: {
    ka: () => import("@/content/legal/marketing.ka").then((m) => m.marketingKa),
    en: () => import("@/content/legal/marketing.en").then((m) => m.marketingEn),
    ru: () => import("@/content/legal/marketing.ru").then((m) => m.marketingRu),
  },
};

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

type Props = {
  policy: PolicyKey;
  locale: AppLocale;
  /** The link's own text: the dialog's name until the document loads. */
  linkLabel: string;
  backLabel: string;
  onClose: () => void;
};

/**
 * Shows a policy document over the consent form it was opened from, so the
 * user reads it and comes back to the same unanswered checkboxes. It replaces
 * a new-tab link: in that tab ConsentGate covered the document with the same
 * dialog again, and on the register wizard the tab had no way back.
 *
 * The opener pushes a history entry before mounting this, so the back arrow,
 * Escape, a backdrop click and the phone's own back gesture all go through
 * history.back() and close it on popstate, without leaving the page.
 *
 * Portalled to <body>: the wizard sits inside transformed motion.divs and the
 * gate uses backdrop-blur, either of which would pin a `fixed` child to the
 * ancestor instead of the viewport. z-[210] clears ConsentGate (z-[200]).
 */
export function PolicyDocumentViewer({
  policy,
  locale,
  linkLabel,
  backLabel,
  onClose,
}: Props) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    LOADERS[policy][locale]().then(
      (loaded) => {
        if (!cancelled) setDoc(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [policy, locale]);

  useEffect(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onPopState = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.history.back();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[210] sm:flex sm:items-center sm:justify-center sm:p-6">
      {/* A sibling, not the panel's parent: a text selection dragged out of
          the panel must not land a click here and close it. */}
      <div
        className="absolute inset-0 bg-slate-950/70"
        aria-hidden="true"
        onClick={() => window.history.back()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc?.title ?? linkLabel}
        className="relative flex h-full w-full flex-col bg-white sm:h-[min(90dvh,960px)] sm:max-w-3xl sm:overflow-hidden sm:rounded-2xl sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center border-b border-[#E2E8F0] px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[14px] font-bold text-slate-900 transition-colors hover:bg-[#F1F5F9]"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            {backLabel}
          </button>
        </div>
        <div
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] outline-none"
        >
          {doc ? (
            <LegalDocumentView doc={doc} />
          ) : failed ? (
            <p className="px-4 py-12 text-center text-[15px]">
              <a
                href={policyHref(policy, locale)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#2563EB] underline"
              >
                {linkLabel}
              </a>
            </p>
          ) : (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94A3B8]" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
