"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Megaphone, Eye } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Property = Tables<"properties">;

export default function GuestDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [recent, setRecent] = useState<Property[]>([]);
  const [transportSvc, setTransportSvc] = useState<Tables<"services">[]>([]);
  const [newOfferCount, setNewOfferCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [profileRes, propsRes, svcRes, smRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).single(),
        supabase
          .from("properties")
          .select("*")
          .eq("status", "active")
          .order("views_count", { ascending: false })
          .limit(3),
        supabase
          .from("services")
          .select("*")
          .in("category", ["transport", "entertainment"])
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("smart_match_requests")
          .select("matched_properties")
          .eq("guest_id", user!.id)
          .eq("status", "active"),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (propsRes.data) setRecent(propsRes.data);
      if (svcRes.data) setTransportSvc(svcRes.data);
      if (smRes.data) {
        const total = smRes.data.reduce(
          (n, r) =>
            n + ((r.matched_properties as unknown as unknown[]) ?? []).length,
          0,
        );
        setNewOfferCount(total);
      }
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const firstName = profile?.display_name?.split(" ")[0] ?? "სტუმარი";

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          გამარჯობა, {firstName}, მზად ხარ დასვენებისთვის? 🏔️
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          აქ მოელის ახალი თავგადასავალი — ჯავშნები, შეთავაზებები და სერვისები
          ერთ სივრცეში.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F8F60] to-[#0B7A52] px-6 py-6 text-white shadow-[0px_10px_30px_-8px_rgba(15,143,96,0.35)] sm:px-8"
      >
        <span className="inline-flex rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
          SMART MATCH
        </span>
        <h2 className="mt-3 text-[22px] font-black leading-[28px]">
          {newOfferCount > 0
            ? `თქვენ გაქვთ ${newOfferCount} ახალი შეთავაზება`
            : "გაგზავნე მოთხოვნა და მიიღე საუკეთესო შეთავაზებები"}
        </h2>
        <p className="mt-1.5 max-w-xl text-[13px] font-medium text-white/80">
          დააფიქსირე სასურველი პირობები და მფლობელები პირდაპირ გამოგიგზავნიან
          შეთავაზებებს.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard/guest/bookings"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-black text-[#0F172A] transition-transform hover:-translate-y-0.5"
          >
            მოთხოვნის გაგზავნა
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard/guest/bookings"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-white/20"
          >
            <Megaphone className="h-4 w-4" />
            მიღებული შეთავაზებები
          </Link>
        </div>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-black text-[#0F172A]">
              ბოლოს ნანახი განცხადებები
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
              გააგრძელე სადაც გაჩერდი.
            </p>
          </div>
          <Link
            href="/apartments"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[#0F8F60] hover:underline"
          >
            ყველას ნახვა
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[260px] rounded-[20px]" />
              ))
            : recent.map((p) => (
                <Link
                  key={p.id}
                  href={
                    p.is_for_sale ? `/sales/${p.id}` : `/apartments/${p.id}`
                  }
                  className="group flex flex-col overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]"
                >
                  <div className="relative h-[150px] w-full overflow-hidden bg-[#F1F5F9]">
                    {(p.photos ?? [])[0] && (
                      <Image
                        src={(p.photos ?? [])[0]}
                        alt={p.title}
                        fill
                        sizes="400px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    {p.is_vip && (
                      <span className="absolute left-3 top-3 rounded-md bg-[#F97316] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                        VIP
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
                      {p.title}
                    </h3>
                    <p className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
                      <Eye className="h-3 w-3" />
                      {p.views_count} ნახვა
                    </p>
                    <div className="mt-auto flex items-baseline gap-1 pt-2">
                      <span className="text-[16px] font-black text-[#0F172A]">
                        {formatPrice(Number(p.price_per_night ?? 0))}
                      </span>
                      <span className="text-[11px] font-medium text-[#94A3B8]">
                        /ღამე
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </motion.section>

      {transportSvc.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-black text-[#0F172A]">
                ტრანსპორტი და გართობა
              </h2>
              <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                დაიჯავშნე შესანიშნავი შთაბეჭდილებებისთვის.
              </p>
            </div>
            <Link
              href="/services"
              className="inline-flex items-center gap-1 text-[13px] font-bold text-[#0F8F60] hover:underline"
            >
              ყველას ნახვა
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {transportSvc.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="group flex items-center gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                  {(s.photos ?? [])[0] && (
                    <Image
                      src={(s.photos ?? [])[0]}
                      alt={s.title}
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
                    {s.title}
                  </h3>
                  {s.price != null && (
                    <p className="mt-1 text-[13px] font-black text-[#0F172A]">
                      {formatPrice(Number(s.price))}
                      {s.price_unit && (
                        <span className="text-[11px] font-medium text-[#94A3B8]">
                          {" "}
                          / {s.price_unit}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
