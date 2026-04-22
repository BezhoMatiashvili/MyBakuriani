"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";

function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="44"
        height="32"
        viewBox="0 0 44 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden
      >
        <path
          d="M4 28 L18 6 L26 18 L32 10 L40 28 Z"
          fill="#0E2150"
          strokeLinejoin="round"
        />
        <path
          d="M15 12 L18 6 L21 12 L19.5 13.5 L18 12.5 L16.5 13.5 Z"
          fill="white"
        />
        <path
          d="M29.5 12.5 L32 10 L34.5 12.5 L33 13.5 L32 12.8 L31 13.5 Z"
          fill="white"
        />
        <path
          d="M0 30 L10 14 L18 28 L22 22 L28 30 Z"
          fill="#1E419A"
          strokeLinejoin="round"
        />
        <path
          d="M7 19 L10 14 L13 19 L11.5 20 L10 19.2 L8.5 20 Z"
          fill="white"
        />
      </svg>
      <span className="text-xl font-extrabold leading-none">
        <span className="text-[#F97316]">My</span>
        <span className="text-[#0E2150]">Bakuriani</span>
      </span>
    </div>
  );
}

export function CreateHeader() {
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
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-6 py-4 sm:px-8">
        <Link href="/" aria-label="MyBakuriani" className="shrink-0">
          <BrandLogo />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/create"
            className="inline-flex h-[40px] items-center gap-1.5 rounded-xl bg-[#F97316] px-4 text-[13px] font-bold text-white shadow-[0px_6px_14px_-4px_rgba(249,115,22,0.45)] transition-colors hover:bg-[#EA6C0E]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            განცხადების დამატება
          </Link>

          {user ? (
            <Link
              href="/dashboard/renter/balance"
              className="inline-flex h-[40px] items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] transition-colors hover:border-[#CBD5E1]"
            >
              <span className="text-[#64748B]">ბალანსი</span>
              <span className="font-bold text-[#0F172A]">
                ₾ {(balance ?? 0).toFixed(2)}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />
            </Link>
          ) : null}

          {user ? (
            <Link
              href="/dashboard"
              className="text-[13px] font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
              კაბინეტი
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="text-[13px] font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
              შესვლა
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
