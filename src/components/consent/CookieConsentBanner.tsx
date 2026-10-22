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
import {
  declineLocation,
  requestUserLocation,
} from "@/lib/geolocation/useUserLocation";

// How long the location button waits. The browser's own geolocation timeout
// does not count the time a permission prompt is on screen, and a WebView with
// no geolocation handler never answers at all, so the wait has its own limit.
const LOCATION_WAIT_MS = 20_000;

type Step = "cookies" | "location";

/**
 * Essential + Analytics + Location choice. There is no Marketing category
 * because this codebase loads no third-party ad or analytics script at all -
 * the only non-essential cookies are mb_vid and the 30-minute session cookie
 * mb_sid (C49), both issued by /api/track/view.
 * Location has no cookie of its own; see src/lib/consent/cookies.ts.
 *
 * The choice is written with document.cookie from the CLIENT on purpose.
 * localeCookie was disabled in src/i18n/routing.ts precisely because
 * Cloudflare refuses to cache any response carrying Set-Cookie (C2); setting a
 * consent cookie from a cacheable page response would re-open that regression.
 *
 * The two questions are asked ONE AT A TIME in the same card (cookies, then
 * location), so the card is half the height on a phone and a tap on an answer
 * visibly changes it. Showing both at once, and keeping the card open until
 * location was answered too, made "ვეთანხმები ყველას" look dead: the card
 * covered most of a phone screen (the whole login form) and stayed unchanged.
 *
 * Only local state closes the card, never a re-read of document.cookie: a
 * browser that drops the write must not be able to keep it open. A missing
 * location answer never opens the card on a later load (only the analytics
 * answer does); the footer's "cookie settings" link re-opens both questions.
 */
export function CookieConsentBanner() {
  const t = useTranslations("CookieConsent");
  const [step, setStep] = useState<Step | null>(null);
  const [locationPending, setLocationPending] = useState(false);

  useEffect(() => {
    const consent = parseCookieConsent(
      readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
    );
    setStep(consent === null ? "cookies" : null);

    const reopen = () => setStep("cookies");
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  const choose = useCallback((analytics: boolean) => {
    // Preserves whatever location choice already exists (or its absence)
    // so re-confirming the cookie choice from "cookie settings" can never
    // silently reset an earlier location grant back to undecided.
    const current = parseCookieConsent(
      readCookieValue(document.cookie, CONSENT_COOKIE_NAME),
    );
    const value = serializeCookieConsent({
      analytics,
      location: current?.location ?? null,
    });
    // Not HttpOnly by design: PageviewTracker must read it before beaconing.
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;
    // Lets already-mounted consumers react without a reload.
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
    // A browser with no geolocation at all cannot answer the second question.
    setStep("geolocation" in navigator ? "location" : null);
  }, []);

  const chooseLocation = useCallback(async (enable: boolean) => {
    if (!enable) {
      // Never calls getCurrentPosition - declining must never trigger a
      // native permission dialog.
      declineLocation();
      setStep(null);
      return;
    }
    setLocationPending(true);
    try {
      await Promise.race([
        requestUserLocation(),
        new Promise((resolve) => window.setTimeout(resolve, LOCATION_WAIT_MS)),
      ]);
    } finally {
      setLocationPending(false);
      // A grant or a denial was recorded by requestUserLocation; a timeout or
      // an unavailable position is deliberately not (C38), so it just ends
      // this visit's question instead of leaving a card that does nothing.
      setStep(null);
    }
  }, []);

  if (step === null) return null;

  return (
    <div
      role="region"
      aria-label={t(step === "cookies" ? "title" : "locationTitle")}
      // z-[100] sits above the sticky_bottom BannerSlot (z-40) and below the
      // blocking ConsentGate overlay (z-[200]). It hides while any modal
      // dialog is open: under the gate it only looked tappable, and over a
      // z-50 menu or sheet it covered their lower half.
      className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 [body:has([aria-modal=true])_&]:hidden"
    >
      {/* Capped to the screen and scrollable: a card taller than the visible
          viewport (small phone, in-app browser, large text) would push its
          top buttons off-screen with no way to reach them. */}
      <div className="mx-auto max-h-[calc(100dvh-1.5rem-env(safe-area-inset-bottom))] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0px_18px_40px_rgba(15,23,42,0.18)] sm:p-5">
        {step === "cookies" ? (
          <>
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
          </>
        ) : (
          <>
            {/* A separate, independent choice: neither gates the other, and
                declining here never calls getCurrentPosition. */}
            <p className="text-[13px] font-bold text-[#0F172A]">
              {t("locationTitle")}
            </p>
            <p className="mt-1.5 text-[12px] leading-[18px] text-[#64748B]">
              {t("locationDescription")}
            </p>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              {/* Never disabled: whatever the location request is doing, the
                  visitor can always say no and close the card. */}
              <button
                type="button"
                onClick={() => void chooseLocation(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-[13px] font-bold text-[#334155] transition-colors hover:border-[#CBD5E1] sm:min-w-[170px]"
              >
                {t("locationNotNow")}
              </button>
              <button
                type="button"
                onClick={() => void chooseLocation(true)}
                disabled={locationPending}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2563EB] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 sm:min-w-[170px]"
              >
                {locationPending ? t("locationPending") : t("enableLocation")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
