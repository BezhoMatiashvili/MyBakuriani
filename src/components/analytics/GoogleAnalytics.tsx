"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_CHANGE_EVENT } from "@/lib/consent/cookies";
import { gaOnConsentChange, gaOnRoute } from "@/lib/ga/client";

// Google Analytics 4 (C62): one page_view per public page (pathname), and the
// consent answer applied without a reload. Renders nothing; LocaleShell mounts
// it only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set. The rules live in
// src/lib/ga/client.ts.
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    window.addEventListener(CONSENT_CHANGE_EVENT, gaOnConsentChange);
    return () =>
      window.removeEventListener(CONSENT_CHANGE_EVENT, gaOnConsentChange);
  }, []);

  useEffect(() => {
    gaOnRoute(pathname);
  }, [pathname]);

  return null;
}
