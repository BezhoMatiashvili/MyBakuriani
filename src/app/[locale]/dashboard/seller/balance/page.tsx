"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Info, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPricingPackages,
  getPackageDisplay,
  type PricingPackage,
} from "@/lib/pricing-packages";

export default function SellerBalancePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPricingPackages(["vip", "sms"]).then(setPackages);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBalance(Number(data.amount ?? 0));
        setLoading(false);
      });
  }, [user, supabase]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          ბალანსი და VIP
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          მართეთ ბალანსი და დააწინაურეთ ობიექტები საუკეთესო შედეგისთვის.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-[20px] bg-[#0F172A] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
            მიმდინარე ბალანსი
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[40px] font-black leading-none">
              {loading ? (
                <Skeleton className="inline-block h-10 w-28 bg-white/10" />
              ) : (
                balance.toFixed(2)
              )}
            </span>
            <span className="text-[18px] font-bold text-white/70">₾</span>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-6 py-3 text-[13px] font-bold text-[#0F172A] shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)] hover:bg-[#F8FAFC] sm:self-center"
        >
          <Plus className="h-4 w-4" />
          ბალანსის შევსება
        </button>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {packages.length === 0 ? (
          <p className="col-span-full text-center text-sm text-[#94A3B8]">
            პაკეტი ჯერ არ არის ხელმისაწვდომი
          </p>
        ) : (
          packages.map((pkg, idx) => {
            const display = getPackageDisplay(pkg);
            const Icon = display.icon;
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * idx }}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${display.iconBg}`}
                >
                  <Icon className={`h-5 w-5 ${display.iconColor}`} />
                </span>
                <h3 className="mt-5 text-[16px] font-black text-[#0F172A]">
                  {pkg.name}
                </h3>
                <p className="mt-2 text-[12px] leading-[18px] text-[#64748B]">
                  {pkg.description ?? pkg.label ?? ""}
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#2563EB] hover:underline"
                >
                  <Info className="h-3.5 w-3.5" />
                  როგორ მუშაობს?
                </button>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[22px] font-black leading-none text-[#0F172A]">
                      {pkg.amount_gel.toFixed(2)}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-[#94A3B8]">
                      {display.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`rounded-xl px-5 py-2.5 text-[12px] font-bold transition-colors ${display.ctaColor}`}
                  >
                    გააქტიურება
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F5F9]">
            <Info className="h-5 w-5 text-[#64748B]" />
          </span>
          <div>
            <p className="text-[14px] font-black text-[#0F172A]">
              ტრანზაქციების ისტორია
            </p>
            <p className="text-[11px] text-[#94A3B8]">
              ბოლო გადარიცხვები და შესყიდვები
            </p>
          </div>
        </div>
        <p className="mt-4 text-[12px] text-[#94A3B8]">
          ჯერ არ გაქვთ ტრანზაქციები.
        </p>
      </motion.div>
    </div>
  );
}
