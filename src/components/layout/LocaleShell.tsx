"use client";

import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

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

export function LocaleShell({ children }: LocaleShellProps) {
  const pathname = usePathname();
  const isDashboard = isDashboardRoute(pathname);
  const isCreate = isCreateRoute(pathname);

  if (isDashboard || isCreate) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
