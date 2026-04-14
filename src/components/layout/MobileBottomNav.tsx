"use client";

import Link from "next/link";
import {
  Home,
  Building,
  CalendarDays,
  Wallet,
  User,
  ClipboardList,
  Star,
  Sparkles,
  ShoppingBag,
  Briefcase,
  Clock,
  ShieldCheck,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  currentPath: string;
  userRole?: string;
}

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

function getTabs(role: string): TabItem[] {
  switch (role) {
    case "admin":
      return [
        { label: "მთავარი", href: "/dashboard/admin", icon: Home },
        {
          label: "ვერიფიკაცია",
          href: "/dashboard/admin/verifications",
          icon: ShieldCheck,
        },
        { label: "კლიენტები", href: "/dashboard/admin/clients", icon: User },
        {
          label: "ანალიტიკა",
          href: "/dashboard/admin/analytics",
          icon: BarChart3,
        },
      ];
    case "renter":
      return [
        { label: "მთავარი", href: "/dashboard/renter", icon: Home },
        {
          label: "ობიექტები",
          href: "/dashboard/renter/listings",
          icon: Building,
        },
        {
          label: "კალენდარი",
          href: "/dashboard/renter/calendar",
          icon: CalendarDays,
        },
        { label: "ბალანსი", href: "/dashboard/renter/balance", icon: Wallet },
        {
          label: "Smart",
          href: "/dashboard/renter/smart-match",
          icon: Sparkles,
        },
      ];
    case "seller":
      return [
        { label: "მთავარი", href: "/dashboard/seller", icon: Home },
        {
          label: "განცხადებები",
          href: "/dashboard/seller/listings",
          icon: Building,
        },
        { label: "პროფილი", href: "/dashboard/renter/profile", icon: User },
      ];
    case "cleaner":
      return [
        { label: "მთავარი", href: "/dashboard/cleaner", icon: Home },
        { label: "განრიგი", href: "/dashboard/cleaner/schedule", icon: Clock },
        {
          label: "შემოსავალი",
          href: "/dashboard/cleaner/earnings",
          icon: Wallet,
        },
      ];
    case "food":
      return [
        { label: "მთავარი", href: "/dashboard/food", icon: Home },
        {
          label: "შეკვეთები",
          href: "/dashboard/food/orders",
          icon: ShoppingBag,
        },
      ];
    case "entertainment":
    case "transport":
    case "employment":
    case "handyman":
      return [
        { label: "მთავარი", href: "/dashboard/service", icon: Home },
        {
          label: "შეკვეთები",
          href: "/dashboard/service/orders",
          icon: Briefcase,
        },
      ];
    case "guest":
    default:
      return [
        { label: "მთავარი", href: "/dashboard/guest", icon: Home },
        {
          label: "ჯავშნები",
          href: "/dashboard/guest/bookings",
          icon: ClipboardList,
        },
        { label: "შეფასებები", href: "/dashboard/guest/reviews", icon: Star },
        { label: "პროფილი", href: "/dashboard/guest/profile", icon: User },
      ];
  }
}

export function MobileBottomNav({
  currentPath,
  userRole = "guest",
}: MobileBottomNavProps) {
  const tabs = getTabs(userRole);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E2E8F0] bg-white shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)] md:hidden">
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
                  isActive ? "text-brand-accent" : "text-[#94A3B8]",
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
