"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_CHANGE_EVENT } from "@/lib/consent/cookies";
import { metaOnConsentChange, metaOnRoute } from "@/lib/meta/client";

// Meta Pixel (C59): one PageView per page (pathname), and the consent answer
// applied without a reload. Renders nothing; LocaleShell mounts it only when
// NEXT_PUBLIC_META_PIXEL_ID is set. The rules live in src/lib/meta/client.ts.
export function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    window.addEventListener(CONSENT_CHANGE_EVENT, metaOnConsentChange);
    return () =>
      window.removeEventListener(CONSENT_CHANGE_EVENT, metaOnConsentChange);
  }, []);

  useEffect(() => {
    metaOnRoute(pathname);
  }, [pathname]);

  return null;
}
