"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { User, ChevronRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddListingButton } from "@/components/shared/AddListingButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

export function SalesTopBar() {
  const t = useTranslations("Navbar");
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<{
    display_name: string;
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
          .select("display_name, avatar_url")
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

  return (
    <header className="sticky top-0 z-50 w-full bg-white">
      <div className="mx-auto flex h-[91px] max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
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
            className="h-12 w-auto"
          />
        </Link>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          {user && (
            <AddListingButton
              label={t("addListing")}
              className="hidden h-[39.5px] px-5 leading-5 sm:inline-flex"
            />
          )}
          {user && (
            <Link href="/dashboard" className="hidden sm:block">
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
            <Link
              href="/dashboard"
              aria-label={t("profile")}
              className="flex size-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#DBEAFE] bg-[#F8FAFC] transition-colors hover:bg-[#EFF6FF]"
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
      </div>
    </header>
  );
}
