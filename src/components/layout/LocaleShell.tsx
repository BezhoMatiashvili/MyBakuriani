"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

interface LocaleShellProps {
  children: ReactNode;
}

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
