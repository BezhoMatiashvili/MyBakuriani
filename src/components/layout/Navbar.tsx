"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Plus,
  ChevronRight,
  LogOut,
  Wallet,
  ClipboardList,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { slideFromRight } from "@/lib/utils/animations";
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

const navItems = [
  { label: "ბინები", href: "/apartments", icon: Home },
  { label: "სასტუმროები", href: "/hotels", icon: Building2 },
  { label: "ტრანსპორტი", href: "/transport", icon: Bus },
  { label: "დასაქმება", href: "/employment", icon: Briefcase },
  { label: "სერვისები", href: "/services", icon: Wrench },
  { label: "კვება", href: "/food", icon: UtensilsCrossed },
  { label: "გართობა", href: "/entertainment", icon: LayoutGrid },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, loading: authLoading, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
    const supabase = createClient();
    async function fetchUserData() {
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
      if (profileRes.data) setProfile(profileRes.data);
      if (balanceRes.data) setBalance(Number(balanceRes.data.amount));
    }
    fetchUserData();
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
    setMobileOpen(false);
    window.location.href = "/";
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close profile dropdown on route change
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

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-white/80 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-md"
          : "bg-white"
      }`}
    >
      {/* Top Row: Logo + Action Buttons */}
      <div className="mx-auto flex h-[91px] max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
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

        {/* Right side action buttons — desktop */}
        <div className="hidden items-center gap-3 md:flex">
          {user && (
            <Link href="/create/rental">
              <Button className="h-[39.5px] w-[222px] gap-1.5 rounded-xl bg-[#F97316] px-5 text-[13px] font-bold leading-5 text-white shadow-[0px_4px_6px_-1px_rgba(249,115,22,0.2),0px_2px_4px_-2px_rgba(249,115,22,0.2)] hover:bg-[#EA580C]">
                <Plus className="size-4" />
                განცხადების დამატება
              </Button>
            </Link>
          )}
          {user && (
            <Link href={dashboardPath}>
              <Button
                variant="outline"
                className="gap-1.5 rounded-xl border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-bold leading-5 text-[#334155]"
              >
                <Wallet className="size-4" />
                ბალანსი {balance !== null ? `₾ ${balance.toFixed(2)}` : "..."}
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
                შესვლა
              </Button>
            </Link>
          )}
          {user && (
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex size-10 items-center justify-center rounded-full border-2 border-[#DBEAFE] bg-[#F8FAFC] transition-colors hover:bg-[#EFF6FF]"
                aria-label="პროფილი"
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
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-12 z-50 w-[220px] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-2 shadow-lg"
                  >
                    {[
                      {
                        href: `${dashboardPath}/bookings`,
                        icon: ClipboardList,
                        label: "ჯავშნები",
                      },
                      {
                        href: `${dashboardPath}/reviews`,
                        icon: Star,
                        label: "შეფასებები",
                      },
                      {
                        href: `${dashboardPath}/profile`,
                        icon: User,
                        label: "პროფილი",
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
                      გასვლა
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="მენიუ"
        >
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Category Navigation Bar (desktop only) */}
      <nav className="hidden border-b border-[#EEF1F4] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:block">
        <div className="mx-auto flex h-[94px] max-w-[1160px] items-center justify-center gap-[60px] px-4 lg:gap-[104px]">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 text-[#64748B] transition-colors hover:text-[#1E293B]"
              >
                <Icon className="size-[26px]" strokeWidth={1.5} />
                <span className="text-[14px] font-bold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 z-50 flex h-full w-[300px] flex-col bg-white shadow-2xl"
              variants={slideFromRight}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="flex items-center justify-between border-b border-[#F1F5F9] p-4">
                <span className="text-lg font-bold text-[#1E293B]">მენიუ</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-bold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                    >
                      <Icon className="size-5 text-[#64748B]" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <div className="border-t border-[#F1F5F9] p-4">
                {!authLoading && !user ? (
                  <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-xl bg-brand-accent text-white">
                      შესვლა
                    </Button>
                  </Link>
                ) : user ? (
                  <div className="flex flex-col gap-2">
                    <Link
                      href={dashboardPath}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Button variant="outline" className="w-full rounded-xl">
                        <User className="mr-2 size-4" />
                        კაბინეტი
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      className="w-full text-[#EF4444]"
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-2 size-4" />
                      გასვლა
                    </Button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
