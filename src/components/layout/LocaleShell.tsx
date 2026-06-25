"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { HomeListingModeProvider } from "@/components/layout/HomeListingModeContext";

interface LocaleShellProps {
  children: ReactNode;
}

const Navbar = dynamic(() =>
  import("@/components/layout/Navbar").then((mod) => mod.Navbar),
);
const Footer = dynamic(() =>
  import("@/components/layout/Footer").then((mod) => mod.Footer),
);
const StickyNewsBar = dynamic(() =>
  import("@/components/layout/StickyNewsBar").then((mod) => mod.StickyNewsBar),
);
const CriticalNotificationGate = dynamic(
  () =>
    import("@/components/notifications/CriticalNotificationGate").then(
      (mod) => mod.CriticalNotificationGate,
    ),
  { ssr: false },
);

function isDashboardRoute(pathname: string) {
  return /(^|\/)dashboard(\/|$)/.test(pathname);
}

function isCreateRoute(pathname: string) {
  return /(^|\/)create(\/|$)/.test(pathname);
}

function isSalesIndexRoute(pathname: string) {
  // Matches /sales and /{locale}/sales exactly — not detail pages like /sales/[id]
  return /(^|\/)sales\/?$/.test(pathname);
}

function isAuthRoute(pathname: string) {
  return /(^|\/)auth(\/|$)/.test(pathname);
}

export function LocaleShell({ children }: LocaleShellProps) {
  const pathname = usePathname();
  const isDashboard = isDashboardRoute(pathname);
  const isCreate = isCreateRoute(pathname);
  const isSalesIndex = isSalesIndexRoute(pathname);
  const isAuth = isAuthRoute(pathname);

  const content = (() => {
    if (isDashboard || isCreate) return <>{children}</>;
    if (isSalesIndex || isAuth) {
      // Sales index and auth pages render their own header; keep global footer.
      return (
        <>
          <main className="flex-1">{children}</main>
          <Footer />
          <StickyNewsBar />
        </>
      );
    }
    return (
      <HomeListingModeProvider>
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <StickyNewsBar />
      </HomeListingModeProvider>
    );
  })();

  return (
    <>
      <CriticalNotificationGate />
      {content}
    </>
  );
}
