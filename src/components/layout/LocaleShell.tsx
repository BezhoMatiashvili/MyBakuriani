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

export function LocaleShell({ children }: LocaleShellProps) {
  const pathname = usePathname();
  const isDashboard = isDashboardRoute(pathname);
  const isCreate = isCreateRoute(pathname);
  const isSalesIndex = isSalesIndexRoute(pathname);

  if (isDashboard || isCreate) {
    return <>{children}</>;
  }

  if (isSalesIndex) {
    // Sales index renders its own simplified top bar; keep global footer.
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
      <main className="flex-1">{children}</main>
      <Footer />
    </HomeListingModeProvider>
  );
}
