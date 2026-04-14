"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  ShoppingBag,
  TrendingUp,
  Plus,
  Pencil,
  Truck,
  Clock,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

interface MenuItem {
  name: string;
  price: number;
  description?: string;
}

export default function FoodDashboardPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [foodService, setFoodService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    menuItems: 0,
    ordersToday: 0,
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
      .single();

    setFoodService(svcData);

    const menuItems = svcData?.menu
      ? (svcData.menu as unknown as MenuItem[]).length
      : 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .gte("created_at", startOfDay.toISOString());

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthCount } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .gte("created_at", startOfMonth.toISOString());

    setStats({
      menuItems,
      ordersToday: todayCount ?? 0,
      revenueThisMonth: (monthCount ?? 0) * (svcData?.price ?? 0),
    });

    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("food-orders-rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchData]);

  const menuItems: MenuItem[] = foodService?.menu
    ? (foodService.menu as unknown as MenuItem[])
    : [];

  async function toggleDelivery() {
    if (!foodService) return;
    const newVal = !foodService.has_delivery;
    await supabase
      .from("services")
      .update({ has_delivery: newVal })
      .eq("id", foodService.id);
    setFoodService({ ...foodService, has_delivery: newVal });
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          {
            "\u10E1\u10D0\u10DB\u10D6\u10D0\u10E0\u10D4\u10E3\u10DA\u10DD\u10E1 \u10D9\u10D0\u10D1\u10D8\u10DC\u10D4\u10E2\u10D8"
          }
        </h1>
        <Link
          href="/dashboard/food/orders"
          className="text-sm font-medium text-brand-accent hover:underline"
        >
          {"\u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8"} →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          icon={<UtensilsCrossed className="h-5 w-5" />}
          label={
            "\u10DB\u10D4\u10DC\u10D8\u10E3\u10E1 \u10D4\u10E0\u10D7\u10D4\u10E3\u10DA\u10D4\u10D1\u10D8"
          }
          value={stats.menuItems}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label={
            "\u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8 \u10D3\u10E6\u10D4\u10E1"
          }
          value={stats.ordersToday}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={
            "\u10E8\u10D4\u10DB\u10DD\u10E1\u10D0\u10D5\u10D0\u10DA\u10D8 \u10D0\u10DB \u10D7\u10D5\u10D4\u10E8\u10D8"
          }
          value={formatPrice(stats.revenueThisMonth)}
          change={null}
          loading={loading}
        />
      </div>

      {foodService && (
        <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <h2 className="mb-3 text-lg font-semibold">
            {
              "\u10DE\u10D0\u10E0\u10D0\u10DB\u10D4\u10E2\u10E0\u10D4\u10D1\u10D8"
            }
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <button
              type="button"
              onClick={toggleDelivery}
              className="flex items-center gap-2 text-sm"
            >
              {foodService.has_delivery ? (
                <ToggleRight className="h-6 w-6 text-brand-accent" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-[#94A3B8]" />
              )}
              <Truck className="h-4 w-4" />
              <span>
                {
                  "\u10DB\u10D8\u10E2\u10D0\u10DC\u10D8\u10E1 \u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D8"
                }
              </span>
              <span
                className={`text-xs ${foodService.has_delivery ? "text-brand-success" : "text-[#94A3B8]"}`}
              >
                {foodService.has_delivery
                  ? "\u10E9\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8\u10D0"
                  : "\u10D2\u10D0\u10DB\u10DD\u10E0\u10D7\u10E3\u10DA\u10D8\u10D0"}
              </span>
            </button>

            <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
              <Clock className="h-4 w-4" />
              <span>
                {
                  "\u10E1\u10D0\u10DB\u10E3\u10E8\u10D0\u10DD \u10E1\u10D0\u10D0\u10D7\u10D4\u10D1\u10D8"
                }
                :
              </span>
              <span className="font-medium text-[#1E293B]">
                {foodService.operating_hours ??
                  "\u10D0\u10E0 \u10D0\u10E0\u10D8\u10E1 \u10DB\u10D8\u10D7\u10D8\u10D7\u10D4\u10D1\u10E3\u10DA\u10D8"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {"\u10DB\u10D4\u10DC\u10D8\u10E3"}
          </h2>
          <Link
            href="/create/service?category=food"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
          >
            <Plus className="h-4 w-4" />
            {
              "\u10D4\u10E0\u10D7\u10D4\u10E3\u10DA\u10D8\u10E1 \u10D3\u10D0\u10DB\u10D0\u10E2\u10D4\u10D1\u10D0"
            }
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[#F8FAFC]" />
            ))}
          </div>
        ) : menuItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#64748B]/30 p-8 text-center">
            <UtensilsCrossed className="mx-auto h-10 w-10 text-[#94A3B8]/50" />
            <p className="mt-2 text-sm text-[#94A3B8]">
              {
                "\u10DB\u10D4\u10DC\u10D8\u10E3 \u10EA\u10D0\u10E0\u10D8\u10D4\u10DA\u10D8\u10D0"
              }
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {menuItems.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center justify-between rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div>
                  <h3 className="text-sm font-semibold">{item.name}</h3>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-[#94A3B8]">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">
                    {formatPrice(item.price)}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#1E293B]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CurrentOrders userId={user?.id} />
    </div>
  );
}

function CurrentOrders({ userId }: { userId: string | undefined }) {
  const supabase = createClient();
  const [orders, setOrders] = useState<
    (Tables<"sms_messages"> & { sender?: { display_name: string } })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("sms_messages")
        .select(
          "*, sender:profiles!sms_messages_from_user_id_fkey(display_name)",
        )
        .eq("to_user_id", userId!)
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      setOrders((data as typeof orders) ?? []);
      setLoading(false);
    }

    load();
  }, [userId, supabase]);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">
        {
          "\u10D3\u10E6\u10D4\u10D5\u10D0\u10DC\u10D3\u10D4\u10DA\u10D8 \u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8"
        }
      </h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#F8FAFC]" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-[#94A3B8]">
          {
            "\u10D3\u10E6\u10D4\u10E1 \u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8 \u10EF\u10D4\u10E0 \u10D0\u10E0 \u10D0\u10E0\u10D8\u10E1"
          }
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 rounded-[20px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {(order.sender as { display_name: string } | undefined)
                    ?.display_name ??
                    "\u10D9\u10DA\u10D8\u10D4\u10DC\u10E2\u10D8"}
                </p>
                <p className="truncate text-xs text-[#94A3B8]">
                  {order.message}
                </p>
              </div>
              <StatusBadge status={order.is_read ? "active" : "pending"} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
