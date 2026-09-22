"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  CONSENT_POLICY_VERSION,
  hasAcceptedRequiredPolicies,
} from "@/lib/consent/channels";
import { ConsentForm } from "@/components/consent/ConsentForm";

/**
 * Blocking consent gate. Any signed-in user who has not accepted the Terms and
 * the Privacy Policy is stopped here until they answer.
 *
 * Modelled on CriticalNotificationGate, which is the only genuinely
 * non-dismissible overlay in this codebase: no close button, no Escape
 * handler, no backdrop-click-to-close. Modal.tsx and BottomSheet.tsx both close
 * unconditionally on Escape and backdrop click and are the wrong primitive.
 *
 * Mounted in LocaleShell so it covers public, dashboard and create routes
 * alike. Staying client-side is what keeps it C28-safe: the public detail
 * routes are cookie-free ISR, so personalization must not move server-side.
 */
export function ConsentGate() {
  const t = useTranslations("ConsentGate");
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  // True once we have CONFIRMED this user accepted. Until then the check is
  // re-run on navigation, which is what catches the registration hand-off:
  // the user is already signed in while completing /auth/register, so userId
  // never changes when the profile row appears, and keying the check on
  // userId alone left the gate invisible until a full page reload.
  const [settled, setSettled] = useState(false);

  // getSession() reads the local cookie (no network), so anonymous visitors on
  // public pages pay zero auth round-trips - same posture as
  // CriticalNotificationGate.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const next = session?.user?.id ?? null;
      setUserId((current) => {
        if (current !== next) setSettled(false);
        return next;
      });
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setNeedsConsent(false);
      setSettled(false);
      return;
    }
    // Once accepted, stop querying: this effect also runs on navigation.
    if (settled) return;
    const uid = userId;
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("terms_accepted_at, privacy_accepted_at")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      // A read failure must not lock the user out of the site, and a missing
      // profile row means they are mid-registration - /auth/register owns
      // that. Neither case is "settled", so both are re-checked on the next
      // navigation, which is how the post-registration hand-off is caught.
      if (error || !data) {
        setNeedsConsent(false);
        return;
      }
      const accepted = hasAcceptedRequiredPolicies(data);
      setNeedsConsent(!accepted);
      if (accepted) setSettled(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, pathname, settled]);

  const handleDone = useCallback(() => {
    setNeedsConsent(false);
    setSettled(true);
  }, []);

  // /auth/* owns its own flow (sign-in, registration wizard), and
  // /consent-required renders this same form full-page - showing the overlay on
  // either would double-render or trap the user mid-sign-in.
  const suppressed =
    /(^|\/)auth(\/|$)/.test(pathname) ||
    /(^|\/)consent-required(\/|$)/.test(pathname);

  if (!userId || !needsConsent || suppressed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <div
        id="consent-gate-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
      >
        <ConsentForm
          source="registration_gate"
          version={CONSENT_POLICY_VERSION}
          onDone={handleDone}
          labels={{
            title: t("title"),
            intro: t("intro"),
            terms: t("terms"),
            termsLink: t("termsLink"),
            privacy: t("privacy"),
            privacyLink: t("privacyLink"),
            marketing: t("marketing"),
            marketingNote: t("marketingNote"),
            submit: t("submit"),
            signOut: t("signOut"),
            error: t("error"),
          }}
        />
      </div>
    </div>
  );
}
