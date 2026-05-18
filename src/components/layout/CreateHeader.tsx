"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";

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

          <Link
            href={user ? "/dashboard" : "/auth/login"}
            className="inline-flex h-[40px] items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#2563EB] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
          >
            {user ? "კაბინეტი" : "შესვლა"}
          </Link>
        </div>
      </div>
    </header>
  );
}
