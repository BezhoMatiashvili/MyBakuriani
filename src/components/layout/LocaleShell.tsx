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

export function LocaleShell({ children }: LocaleShellProps) {
  const pathname = usePathname();
  const isDashboard = isDashboardRoute(pathname);

  if (isDashboard) {
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
