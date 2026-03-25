"use client";

import Link from "next/link";
import { Home, Building, CalendarDays, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  currentPath: string;
}

const tabs = [
  { label: "მთავარი", href: "/dashboard", icon: Home },
  { label: "ობიექტები", href: "/dashboard/listings", icon: Building },
  { label: "კალენდარი", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "ბალანსი", href: "/dashboard/balance", icon: Wallet },
  { label: "პროფილი", href: "/dashboard/profile", icon: User },
];

export function MobileBottomNav({ currentPath }: MobileBottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-surface-border bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            currentPath === tab.href ||
            (tab.href !== "/dashboard" && currentPath.startsWith(tab.href));

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-brand-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
