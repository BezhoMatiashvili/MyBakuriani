"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import {
  ShoppingBag,
  Star,
  Eye,
  ChevronRight,
  Sparkles,
  Truck,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

export default function FoodDashboardPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [published, setPublished] = useState(true);
  const [stats, setStats] = useState({
    ordersToday: 0,
    totalOrders: 0,
    revenueThisMonth: 0,
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: svcData } = await supabase
      .from("services")
      .select("*")
      .eq("owner_id", user.id)
      .eq("category", "food")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (svcData) {
      setRestaurant(svcData);
      setPublished(svcData.status === "active");
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [todayRes, monthRes, totalRes] = await Promise.all([
      supabase
        .from("sms_messages")
        .select("*", { count: "exact", head: true })
        .eq("to_user_id", user.id)
        .gte("created_at", startOfDay.toISOString()),
      supabase
        .from("sms_messages")
        .select("*", { count: "exact", head: true })
        .eq("to_user_id", user.id)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("sms_messages")
        .select("*", { count: "exact", head: true })
        .eq("to_user_id", user.id),
    ]);

    const unitPrice = svcData?.price ?? 0;
    setStats({
      ordersToday: todayRes.count ?? 0,
      totalOrders: totalRes.count ?? 0,
      revenueThisMonth: (monthRes.count ?? 0) * unitPrice,
    });

    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function togglePublished() {
    if (!restaurant) return;
    const next = !published;
    setPublished(next);
    await supabase
      .from("services")
      .update({ status: next ? "active" : "draft" })
      .eq("id", restaurant.id);
  }

  const name = restaurant?.title ?? "რესტორანი";
  const rating = 0;
  const views = restaurant?.views_count ?? 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {name}
          </h1>
          <p className="mt-1 flex items-center gap-3 text-[13px] font-medium text-[#64748B]">
            {rating > 0 && (
              <span className="inline-flex items-center gap-1 text-[#F59E0B]">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                <span className="font-bold text-[#0F172A]">
                  {rating.toFixed(1)}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {views} ნახვა
            </span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={published}
          onClick={togglePublished}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-4 text-[12px] font-bold text-[#0F172A] transition-colors"
        >
          <span
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{ backgroundColor: published ? "#10B981" : "#E2E8F0" }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{
                transform: published ? "translateX(18px)" : "translateX(2px)",
              }}
            />
          </span>
          <span className={published ? "text-[#10B981]" : "text-[#64748B]"}>
            {published ? "გამოქვეყნებული" : "გაჩერებული"}
          </span>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] p-8 text-white shadow-[0px_20px_50px_-12px_rgba(15,23,42,0.4)]"
      >
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#F97316] opacity-20 blur-3xl"
        />
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
          <Sparkles className="h-3 w-3" />
          PREMIUM გადახდილია
        </p>
        <div className="relative mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-white/60">
              დღის ბრუნვა
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-[56px] w-[200px] bg-white/10" />
            ) : (
              <p className="mt-1 text-[52px] font-black leading-[60px]">
                {stats.revenueThisMonth.toFixed(2)}
                <span className="ml-1 text-[22px] font-bold text-white/60">
                  ₾
                </span>
              </p>
            )}
          </div>
          <Link
            href="/dashboard/food/orders"
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-5 py-3 text-[13px] font-black text-white transition-colors hover:bg-[#059669]"
          >
            მენიუ და აქცია
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#2563EB]">
            <ShoppingBag className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              სულ შეკვეთები
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#2563EB]">
              {stats.totalOrders.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2 text-[#F97316]">
            <Eye className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
              პროფილის ნახვა
            </p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-3 text-[32px] font-black leading-[36px] text-[#F97316]">
              {views.toLocaleString()}
            </p>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <h2 className="text-[15px] font-black text-[#0F172A]">
          ჩემი განცხადება
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
            <Truck className="h-4 w-4 text-[#2563EB]" />
            <span>მიტანის სერვისი:</span>
            <span
              className={
                restaurant?.has_delivery
                  ? "font-bold text-[#10B981]"
                  : "text-[#94A3B8]"
              }
            >
              {restaurant?.has_delivery ? "ჩართულია" : "გამორთულია"}
            </span>
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-[#E2E8F0] sm:block" />
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
            <Clock className="h-4 w-4 text-[#2563EB]" />
            <span>სამუშაო საათები:</span>
            <span className="font-bold text-[#0F172A]">
              {restaurant?.operating_hours ?? "არ არის მითითებული"}
            </span>
          </div>
          {restaurant?.price != null && (
            <>
              <span
                aria-hidden
                className="hidden h-5 w-px bg-[#E2E8F0] sm:block"
              />
              <div className="text-[13px] font-medium text-[#64748B]">
                საშ. ფასი:{" "}
                <span className="font-bold text-[#0F172A]">
                  {formatPrice(Number(restaurant.price))}
                </span>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
