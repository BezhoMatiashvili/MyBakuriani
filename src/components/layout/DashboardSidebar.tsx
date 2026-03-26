"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  Building,
  CalendarDays,
  Wallet,
  Bell,
  User,
  ChevronLeft,
  Sparkles,
  Star,
  ClipboardList,
  ShoppingBag,
  Settings,
  Users,
  BarChart3,
  ShieldCheck,
  Briefcase,
  Clock,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardSidebarProps {
  userName: string;
  userRole: string;
  avatarUrl?: string;
  smsCount?: number;
  currentPath: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

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

function getNavItems(role: string): NavItem[] {
  switch (role) {
    case "admin":
      return [
        { label: "მთავარი", href: "/dashboard/admin", icon: Home },
        {
          label: "ვერიფიკაციები",
          href: "/dashboard/admin/verifications",
          icon: ShieldCheck,
        },
        { label: "კლიენტები", href: "/dashboard/admin/clients", icon: Users },
        {
          label: "განცხადებები",
          href: "/dashboard/admin/listings",
          icon: Building,
        },
        {
          label: "ანალიტიკა",
          href: "/dashboard/admin/analytics",
          icon: BarChart3,
        },
        {
          label: "პარამეტრები",
          href: "/dashboard/admin/settings",
          icon: Settings,
        },
      ];
    case "renter":
      return [
        { label: "მთავარი", href: "/dashboard/renter", icon: Home },
        {
          label: "ჩემი ობიექტები",
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
          label: "Smart Match",
          href: "/dashboard/renter/smart-match",
          icon: Sparkles,
        },
        { label: "პროფილი", href: "/dashboard/renter/profile", icon: User },
      ];
    case "seller":
      return [
        { label: "მთავარი", href: "/dashboard/seller", icon: Home },
        {
          label: "ჩემი განცხადებები",
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
          icon: DollarSign,
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

export function DashboardSidebar({
  userName,
  userRole,
  avatarUrl,
  smsCount = 0,
  currentPath,
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navItems = getNavItems(userRole);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <motion.aside
      className="hidden h-screen border-r border-brand-surface-border bg-white md:flex md:flex-col"
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {/* User info */}
      <div className="flex items-center gap-3 border-b border-brand-surface-border p-4">
        <Avatar>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {userName}
            </p>
            <Badge variant="secondary" className="mt-0.5 text-xs">
              {roleLabels[userRole] ?? userRole}
            </Badge>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.href ||
              (item.href.split("/").length > 2 &&
                currentPath.startsWith(item.href) &&
                currentPath !== item.href.split("/").slice(0, -1).join("/"));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-accent-light text-brand-accent"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="size-5 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* SMS counter */}
      {!collapsed && smsCount > 0 && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg bg-brand-accent-light px-3 py-2">
          <Bell className="size-4 text-brand-accent" />
          <span className="text-xs font-medium text-brand-accent">
            {smsCount} შეტყობინება
          </span>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-brand-surface-border p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "გაშლა" : "ჩაკეცვა"}
          className="w-full"
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="size-4" />
          </motion.div>
        </Button>
      </div>
    </motion.aside>
  );
}
