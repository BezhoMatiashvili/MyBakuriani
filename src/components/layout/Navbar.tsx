"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  Building2,
  Bus,
  Briefcase,
  Wrench,
  UtensilsCrossed,
  LayoutGrid,
  Menu,
  X,
  User,
  ChevronRight,
  LogOut,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddListingButton } from "@/components/shared/AddListingButton";
import { useAuth } from "@/lib/hooks/useAuth";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useHomeListingMode } from "@/components/layout/HomeListingModeContext";

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/dashboard/admin",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/entertainment",
  transport: "/dashboard/transport",
  employment: "/dashboard/employment",
  handyman: "/dashboard/services",
};

const navItemKeys = [
  { key: "apartments" as const, href: "/apartments", icon: Home },
  { key: "hotels" as const, href: "/hotels", icon: Building2 },
  { key: "transport" as const, href: "/transport", icon: Bus },
  { key: "employment" as const, href: "/employment", icon: Briefcase },
  { key: "services" as const, href: "/services", icon: Wrench },
  { key: "food" as const, href: "/food", icon: UtensilsCrossed },
  { key: "entertainment" as const, href: "/entertainment", icon: LayoutGrid },
];

export function Navbar() {
  const pathname = usePathname();
  const { listingMode } = useHomeListingMode();
  const t = useTranslations("Navbar");
  const categoryNavPaths = [
    "/apartments",
    "/hotels",
    "/transport",
    "/employment",
    "/services",
    "/food",
    "/entertainment",
  ];
  const isCategoryListingPage = categoryNavPaths.some((p) => pathname === p);
  const showCategoryNav =
    (pathname === "/" && listingMode === "rent") || isCategoryListingPage;
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllRead,
  } = useNotifications();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState<{
    display_name: string;
    role: string;
    avatar_url: string | null;
  } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setBalance(null);
      return;
    }
    let cancelled = false;
    async function fetchUserData() {
      const supabase = createClient();
      const [profileRes, balanceRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, role, avatar_url")
          .eq("id", user!.id)
          .single(),
        supabase
          .from("balances")
          .select("amount")
          .eq("user_id", user!.id)
          .single(),
      ]);
      if (cancelled) return;
      if (profileRes.data) setProfile(profileRes.data);
      if (balanceRes.data) setBalance(Number(balanceRes.data.amount));
    }

    const deferFetch = () => {
      void fetchUserData();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (window as Window & typeof globalThis).requestIdleCallback(
        deferFetch,
        { timeout: 1500 },
      );
      return () => {
        cancelled = true;
        (window as Window & typeof globalThis).cancelIdleCallback(idleId);
      };
    }

    const timeoutId = setTimeout(deferFetch, 600);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [user]);

  const dashboardPath = profile
    ? (ROLE_DASHBOARD[profile.role] ?? "/dashboard/guest")
    : "/dashboard/guest";
  // The public bell is intentionally cross-cabinet, so it always opens the
  // aggregate inbox rather than whichever cabinet happens to be primary.
  const viewAllNotificationsPath = "/notifications";

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      // signOut may fail if session already expired
    }
    setMobileOpen(false);
    window.location.href = "/";
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const menuTrigger = mobileMenuTriggerRef.current;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        mobileMenuRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
    const timer = window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuTrigger?.focus();
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled && !mobileOpen
          ? "bg-white/80 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-md"
          : "bg-white"
      }`}
    >
      {/* Top Row: Logo + Action Buttons */}
      <div className="mx-auto flex h-[91px] max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          aria-label="MyBakuriani"
          className="flex shrink-0 items-center"
        >
          <Image
            src="/logo.png"
            alt="MyBakuriani"
            width={300}
            height={199}
            priority
            className="h-12 w-auto"
          />
        </Link>

        {/* Right side action buttons — desktop */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSelector />
          <AddListingButton
            label={t("addListing")}
            className="h-[39.5px] w-[222px] px-5 leading-5"
          />
          {user && (
            <Link href={dashboardPath}>
              <Button
                variant="outline"
                className="gap-1.5 rounded-xl border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-bold leading-5 text-[#334155]"
              >
                <Wallet className="size-4" />
                {t("balance")}{" "}
                {balance !== null ? `${balance.toFixed(2)} ₾` : "..."}
                <ChevronRight className="size-4 text-[#94A3B8]" />
              </Button>
            </Link>
          )}
          {user && (
            <NotificationBell
              variant="desktop"
              notifications={notifications}
              unreadCount={unreadCount}
              loading={notificationsLoading}
              markAsRead={markAsRead}
              markAllRead={markAllRead}
              viewAllPath={viewAllNotificationsPath}
            />
          )}
          {authLoading && (
            <div
              className="size-10 animate-pulse rounded-full bg-[#F1F5F9]"
              aria-hidden
            />
          )}
          {!authLoading && !user && (
            <Link href="/auth/login">
              <Button
                variant="outline"
                className="rounded-xl border-2 border-[#DBEAFE] bg-white px-6 text-[13px] font-bold leading-5 text-[#2563EB]"
              >
                {t("login")}
              </Button>
            </Link>
          )}
          {user && (
            <Link
              href={dashboardPath}
              aria-label={t("profile")}
              className="flex size-11 md:size-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#DBEAFE] bg-[#F8FAFC] transition-colors hover:bg-[#EFF6FF]"
            >
              {profile?.avatar_url ? (
                <span className="relative block size-full overflow-hidden rounded-full">
                  <Image
                    src={profile.avatar_url}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                </span>
              ) : (
                <User className="size-5 text-[#2563EB]" />
              )}
            </Link>
          )}
        </div>

        {/* Mobile actions: language + bell + hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <LanguageSelector />
          {user && (
            <NotificationBell
              variant="mobile"
              notifications={notifications}
              unreadCount={unreadCount}
              loading={notificationsLoading}
              markAsRead={markAsRead}
              markAllRead={markAllRead}
              viewAllPath={viewAllNotificationsPath}
            />
          )}
          <AddListingButton label={t("addListing")} variant="icon" />
          <Button
            ref={mobileMenuTriggerRef}
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={() => setMobileOpen(true)}
            aria-label={t("menu")}
            data-testid="menu-toggle"
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      {/* Category Navigation Bar (desktop only) — home + rent mode */}
      {showCategoryNav ? (
        <nav className="hidden border-b border-[#EEF1F4] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
          <div className="mx-auto flex h-[94px] max-w-[1160px] items-center justify-center gap-6 px-4 lg:gap-[60px] xl:gap-[104px]">
            {navItemKeys.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-2 transition-colors ${
                    isActive
                      ? "text-[#1E293B]"
                      : "text-[#64748B] hover:text-[#1E293B]"
                  }`}
                >
                  <Icon
                    className={`size-[26px] ${isActive ? "text-[#2563EB]" : ""}`}
                    strokeWidth={1.5}
                  />
                  <span className="text-[14px] font-bold">{t(item.key)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {/* Mobile Menu */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={mobileMenuRef}
            className="fixed right-0 top-0 z-50 flex h-[100dvh] w-[88vw] max-w-[320px] flex-col bg-white pt-[env(safe-area-inset-top)] shadow-2xl md:w-[320px]"
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
          >
            <div className="flex items-center justify-between border-b border-[#F1F5F9] p-4">
              <span className="text-lg font-bold text-[#1E293B]">
                {t("menu")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                onClick={() => setMobileOpen(false)}
                aria-label={t("close")}
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AddListingButton
                label={t("addListing")}
                variant="mobile"
                className="mb-2 flex"
                onClick={() => setMobileOpen(false)}
              />
              {navItemKeys.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-bold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <Icon className="size-5 text-[#64748B]" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-[#F1F5F9] p-4">
              {!authLoading && !user ? (
                <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                  <Button className="w-full rounded-xl bg-brand-accent text-white">
                    {t("login")}
                  </Button>
                </Link>
              ) : user ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-[13px] font-bold leading-5 text-[#334155]">
                    <span className="flex items-center gap-2">
                      <Wallet className="size-4 text-[#64748B]" />
                      {t("balance")}
                    </span>
                    <span className={balance !== null ? "" : "text-[#94A3B8]"}>
                      {balance !== null ? `${balance.toFixed(2)} ₾` : "..."}
                    </span>
                  </div>
                  <Link
                    href={dashboardPath}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Button variant="outline" className="w-full rounded-xl">
                      <User className="mr-2 size-4" />
                      {t("dashboard")}
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full text-[#EF4444]"
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 size-4" />
                    {t("logout")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
