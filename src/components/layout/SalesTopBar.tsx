"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  User,
  Plus,
  ChevronRight,
  LogOut,
  Wallet,
  ClipboardList,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const ROLE_DASHBOARD: Record<string, string> = {
  admin: "/dashboard/admin",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/service",
  transport: "/dashboard/service",
  employment: "/dashboard/service",
  handyman: "/dashboard/service",
};

export function SalesTopBar() {
  const pathname = usePathname();
  const t = useTranslations("Navbar");
  const { user, loading: authLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<{
    display_name: string;
    role: string;
    avatar_url: string | null;
  } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      // signOut may fail if session already expired
    }
    window.location.href = "/";
  }

  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  return (
    <header className="sticky top-0 z-50 w-full bg-white">
      <div className="mx-auto flex h-[91px] max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <svg
            width="40"
            height="32"
            viewBox="0 0 40 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <path
              d="M20 2L32 22H8L20 2Z"
              fill="#0E2150"
              stroke="#0E2150"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M12 10L20 24H4L12 10Z"
              fill="#1E419A"
              stroke="#1E419A"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M20 2L24 8L20 10L16 8L20 2Z" fill="white" opacity="0.6" />
            <circle cx="30" cy="8" r="4" fill="#F97316" />
          </svg>
          <span className="text-xl font-bold">
            <span className="text-[#F97316]">My</span>
            <span className="text-[#0E2150]">Bakuriani</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <Link href="/create" className="hidden sm:block">
              <Button className="h-[39.5px] gap-1.5 rounded-xl bg-[#F97316] px-5 text-[13px] font-bold leading-5 text-white shadow-[0px_4px_6px_-1px_rgba(249,115,22,0.2),0px_2px_4px_-2px_rgba(249,115,22,0.2)] hover:bg-[#EA580C]">
                <Plus className="size-4" />
                {t("addListing")}
              </Button>
            </Link>
          )}
          {user && (
            <Link href={dashboardPath} className="hidden sm:block">
              <Button
                variant="outline"
                className="gap-1.5 rounded-xl border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-bold leading-5 text-[#334155]"
              >
                <Wallet className="size-4" />
                {t("balance")}{" "}
                {balance !== null ? `₾ ${balance.toFixed(2)}` : "..."}
                <ChevronRight className="size-4 text-[#94A3B8]" />
              </Button>
            </Link>
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
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex size-10 items-center justify-center rounded-full border-2 border-[#DBEAFE] bg-[#F8FAFC] transition-colors hover:bg-[#EFF6FF]"
                aria-label={t("profile")}
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
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-[220px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-2 shadow-lg">
                  {[
                    {
                      href: `${dashboardPath}/bookings`,
                      icon: ClipboardList,
                      label: t("bookings"),
                    },
                    {
                      href: `${dashboardPath}/reviews`,
                      icon: Star,
                      label: t("reviews"),
                    },
                    {
                      href: `${dashboardPath}/profile`,
                      icon: User,
                      label: t("profile"),
                    },
                  ].map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setProfileOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-[14px] font-bold transition-colors ${
                          isActive
                            ? "border-l-[3px] border-l-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                            : "text-[#334155] hover:bg-[#EFF6FF]"
                        }`}
                      >
                        <Icon
                          className={`size-5 ${isActive ? "text-[#2563EB]" : "text-[#64748B]"}`}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                  <div className="my-1 border-t border-[#F1F5F9]" />
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2]"
                  >
                    <LogOut className="size-5" />
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
