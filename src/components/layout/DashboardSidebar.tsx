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

const navItems = [
  { label: "მთავარი", href: "/dashboard", icon: Home },
  { label: "ჩემი ობიექტები", href: "/dashboard/listings", icon: Building },
  { label: "კალენდარი", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "ბალანსი", href: "/dashboard/balance", icon: Wallet },
  { label: "შეტყობინებები", href: "/dashboard/notifications", icon: Bell },
  { label: "პროფილი", href: "/dashboard/profile", icon: User },
];

export function DashboardSidebar({
  userName,
  userRole,
  avatarUrl,
  smsCount = 0,
  currentPath,
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

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
        <Avatar size="lg">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {userName}
            </p>
            <Badge variant="secondary" className="mt-0.5 text-xs">
              {userRole}
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
              (item.href !== "/dashboard" && currentPath.startsWith(item.href));
            const isNotifications = item.icon === Bell;

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
                  {!collapsed && isNotifications && smsCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-accent text-[10px] font-bold text-white">
                      {smsCount > 99 ? "99+" : smsCount}
                    </span>
                  )}
                  {collapsed && isNotifications && smsCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-brand-accent" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

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
