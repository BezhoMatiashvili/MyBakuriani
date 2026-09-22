"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_OPEN_EVENT,
  parseCookieConsent,
  readCookieValue,
  serializeCookieConsent,
} from "@/lib/consent/cookies";

/**
 * Essential + Analytics cookie choice. There is no Marketing category because
 * this codebase loads no third-party ad or analytics script at all - the only
 * non-essential cookie is mb_vid, issued by /api/track/view.
 *
 * The choice is written with document.cookie from the CLIENT on purpose.
 * localeCookie was disabled in src/i18n/routing.ts precisely because
 * Cloudflare refuses to cache any response carrying Set-Cookie (C2); setting a
 * consent cookie from a cacheable page response would re-open that regression.
 */
export function CookieConsentBanner() {
  const t = useTranslations("CookieConsent");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Null = never answered. Never default to yes.
    const answered =
      parseCookieConsent(
        readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
      ) !== null;
    setOpen(!answered);

    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  const choose = useCallback((analytics: boolean) => {
    const value = serializeCookieConsent({ analytics });
    // Not HttpOnly by design: PageviewTracker must read it before beaconing.
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;
    setOpen(false);
    // Lets already-mounted consumers react without a reload.
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  }, []);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label={t("title")}
      // z-[100] sits above the sticky_bottom BannerSlot (z-40) and below the
      // blocking ConsentGate overlay (z-[200]).
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_18px_40px_rgba(15,23,42,0.18)] sm:p-5">
        <p className="text-[13px] font-bold text-[#0F172A]">{t("title")}</p>
        <p className="mt-1.5 text-[12px] leading-[18px] text-[#64748B]">
          {t("description")}{" "}
          <a
            href="/privacy#cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#2563EB] underline"
          >
            {t("learnMore")}
          </a>
        </p>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          {/* Equal prominence: declining must be exactly as easy as accepting. */}
          <button
            type="button"
            onClick={() => choose(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-[13px] font-bold text-[#334155] transition-colors hover:border-[#CBD5E1] sm:min-w-[170px]"
          >
            {t("essentialOnly")}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2563EB] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] sm:min-w-[170px]"
          >
            {t("acceptAll")}
          </button>
        </div>
      </div>
    </div>
  );
}
