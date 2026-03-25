"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useProfile } from "@/lib/hooks/useProfile";
import { useBalance } from "@/lib/hooks/useBalance";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  guest: "სტუმარი",
  renter: "გამქირავებელი",
  seller: "გამყიდველი",
  cleaner: "დამლაგებელი",
  food: "კვება",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  employment: "დასაქმება",
  handyman: "ხელოსანი",
  admin: "ადმინი",
};

const roleDashboardPaths: Record<string, string> = {
  guest: "/dashboard/guest",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/service",
  transport: "/dashboard/service",
  employment: "/dashboard/service",
  handyman: "/dashboard/service",
  admin: "/dashboard/admin",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile } = useProfile();
  const { balance } = useBalance();
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  const userName = profile?.display_name ?? "მომხმარებელი";
  const userRole = profile?.role ?? "guest";
  const avatarUrl = profile?.avatar_url ?? undefined;
  const smsCount = balance?.sms_remaining ?? 0;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <DashboardSidebar
        userName={userName}
        userRole={roleLabels[userRole] ?? userRole}
        avatarUrl={avatarUrl}
        smsCount={smsCount}
        currentPath={pathname}
      />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {/* Top bar with role switcher */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-surface-border bg-white px-4 py-3 md:px-6">
          <div className="relative">
            <button
              onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span>{roleLabels[userRole] ?? userRole}</span>
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  roleSwitcherOpen && "rotate-180",
                )}
              />
            </button>

            {/* Role switcher dropdown */}
            {roleSwitcherOpen && (
              <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-brand-surface-border bg-white py-1 shadow-lg">
                {Object.entries(roleLabels).map(([role, label]) => (
                  <a
                    key={role}
                    href={roleDashboardPaths[role] ?? "/dashboard"}
                    className={cn(
                      "block px-4 py-2 text-sm transition-colors hover:bg-muted",
                      role === userRole
                        ? "font-semibold text-brand-accent"
                        : "text-foreground",
                    )}
                    onClick={() => setRoleSwitcherOpen(false)}
                  >
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* SMS counter badge */}
          {smsCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-brand-accent-light px-3 py-1 text-xs font-medium text-brand-accent">
              SMS: {smsCount}
            </span>
          )}
        </div>

        <div className="p-4 md:p-6">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <MobileBottomNav currentPath={pathname} />
    </div>
  );
}
