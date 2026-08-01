"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { LanguageSelector } from "@/components/LanguageSelector";
import { AddListingButton } from "@/components/shared/AddListingButton";

export function CreateHeader() {
  const t = useTranslations("CreateHeader");
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setBalance(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBalance(data.amount);
      });
  }, [user]);

  return (
    <header className="w-full border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between gap-2 px-4 sm:px-6 lg:h-[80px] lg:gap-4 lg:px-8">
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
            className="h-10 w-auto lg:h-12"
          />
        </Link>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          <AddListingButton label={t("addListing")} className="hidden lg:inline-flex" />

          {user ? (
            <Link
              href="/dashboard/renter/balance"
              className="hidden h-[40px] items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] transition-colors hover:border-[#CBD5E1] lg:inline-flex"
            >
              <span className="text-[#64748B]">{t("balance")}</span>
              <span className="font-bold text-[#0F172A]">
                ₾ {(balance ?? 0).toFixed(2)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />
            </Link>
          ) : null}

          <Link
            href={user ? "/dashboard" : "/auth/login"}
            className="inline-flex h-11 items-center rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#2563EB] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] lg:h-[40px] lg:px-4 lg:text-[13px]"
          >
            {user ? t("cabinet") : t("signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
}
