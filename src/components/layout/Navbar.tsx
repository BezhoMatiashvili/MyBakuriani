"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Menu, X, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { slideFromRight } from "@/lib/utils/animations";

const navItems = [
  { label: "აპარტამენტები", href: "/apartments" },
  { label: "სასტუმროები", href: "/hotels" },
  { label: "ყიდვა-გაყიდვა", href: "/sales" },
  { label: "სერვისები", href: "/services" },
  { label: "გართობა", href: "/entertainment" },
];

const mobileNavItems = [
  { label: "აპარტამენტები", href: "/apartments" },
  { label: "სასტუმროები", href: "/hotels" },
  { label: "ყიდვა-გაყიდვა", href: "/sales" },
  { label: "სერვისები", href: "/services" },
  { label: "ტრანსპორტი", href: "/transport" },
  { label: "გართობა", href: "/entertainment" },
  { label: "კვება", href: "/food" },
  { label: "დასაქმება", href: "/employment" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
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
        scrolled ? "bg-white/80 shadow-sm backdrop-blur-md" : "bg-white"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-brand-primary">
          MyBakuriani
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm font-bold text-[#64748B] transition-colors hover:text-[#1E293B]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <Link href="/search">
            <Button variant="ghost" size="icon" aria-label="ძიება">
              <Search className="size-5" />
            </Button>
          </Link>

          <Link href="/auth/login" className="hidden md:inline-flex">
            <Button variant="ghost" size="icon" aria-label="პროფილი">
              <User className="size-5" />
            </Button>
          </Link>

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
      </nav>

      {/* Mobile menu overlay + slide-in panel */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />

            {/* Panel */}
            <motion.div
              className="fixed inset-y-0 right-0 z-50 w-[280px] bg-white p-6 shadow-xl"
              variants={slideFromRight}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="text-lg font-bold text-brand-primary">
                  MyBakuriani
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="დახურვა"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <ul className="flex flex-col gap-1">
                {mobileNavItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-6 space-y-2 border-t pt-6">
                <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full gap-2">
                    <User className="size-4" />
                    შესვლა
                  </Button>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
