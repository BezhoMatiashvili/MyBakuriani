"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { HomeListingModeProvider } from "@/components/layout/HomeListingModeContext";
import { PageviewTracker } from "@/components/analytics/PageviewTracker";

interface LocaleShellProps {
  children: ReactNode;
}

const Navbar = dynamic(() =>
  import("@/components/layout/Navbar").then((mod) => mod.Navbar),
);
const Footer = dynamic(() =>
  import("@/components/layout/Footer").then((mod) => mod.Footer),
);
const BannerSlot = dynamic(() => import("@/components/banners/BannerSlot"));
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

function isCheckoutRoute(pathname: string) {
  return /(^|\/)checkout(\/|$)/.test(pathname);
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
  const isCheckout = isCheckoutRoute(pathname);
  const isSalesIndex = isSalesIndexRoute(pathname);
  const isAuth = isAuthRoute(pathname);

  const content = (() => {
    // Checkout is a standalone hosted-style payment page — no app chrome.
    if (isDashboard || isCreate || isCheckout) return <>{children}</>;
    if (isSalesIndex || isAuth) {
      // Sales index and auth pages render their own header; keep global footer.
      return (
        <>
          <main className="flex-1">{children}</main>
          <Footer />
        </>
      );
    }
    return (
      <HomeListingModeProvider>
        <Navbar />
        {/* Site-wide slots. The home page renders its own placements
            server-side; these three are client-fetched and share one request
            with every other slot on the page. */}
        <BannerSlot placement="header_strip" />
        <main className="flex-1">{children}</main>
        <BannerSlot placement="footer_leaderboard" />
        <Footer />
        {/* Was gated to the home page, which contradicted the admin help text
            promising "ხილული საიტის ყველა საჯარო გვერდზე". */}
        <BannerSlot placement="sticky_bottom" />
      </HomeListingModeProvider>
    );
  })();

  return (
    <>
      <PageviewTracker />
      <CriticalNotificationGate />
      {content}
    </>
  );
}
