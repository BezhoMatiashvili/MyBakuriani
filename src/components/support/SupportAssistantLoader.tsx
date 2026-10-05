"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// The assistant needs the browser (page scans, sessionStorage) and is not part
// of first paint, so its code loads after hydration (C43).
const SupportAssistant = dynamic(
  () => import("./SupportAssistant").then((mod) => mod.SupportAssistant),
  { ssr: false },
);

// The dashboard and /create layouts mount their own copy inside their own
// message providers; the root layout's copy covers every other page.
const OWN_MOUNT = /^\/(?:(?:ka|en|ru)\/)?(?:dashboard|create)(?:\/|$)/;

export function SupportAssistantLoader({
  homeRole,
  publicSite = false,
}: {
  homeRole?: string | null;
  /** The root layout's copy: public pages, sign-in and registration. */
  publicSite?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  // Public pages fetch the widget once the browser is idle, so it never
  // competes with the page's own first paint (C40).
  const [ready, setReady] = useState(!publicSite);

  useEffect(() => {
    if (ready) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), {
        timeout: 2000,
      });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (!ready || (publicSite && OWN_MOUNT.test(pathname))) return null;
  return <SupportAssistant homeRole={homeRole} />;
}
