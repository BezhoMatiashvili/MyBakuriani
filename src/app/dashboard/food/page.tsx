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

    // Fetch food service(s)
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

    // Count orders (messages) today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .gte("created_at", startOfDay.toISOString());

    // Count messages this month for revenue estimate
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

  // Real-time subscription for new orders
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">სამზარეულოს კაბინეტი</h1>
        <Link
          href="/dashboard/food/orders"
          className="text-sm font-medium text-brand-accent hover:underline"
        >
          შეკვეთები →
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          icon={<UtensilsCrossed className="h-5 w-5" />}
          label="მენიუს ერთეულები"
          value={stats.menuItems}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="შეკვეთები დღეს"
          value={stats.ordersToday}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="შემოსავალი ამ თვეში"
          value={formatPrice(stats.revenueThisMonth)}
          change={null}
          loading={loading}
        />
      </div>

      {/* Quick Settings */}
      {foodService && (
        <div className="rounded-xl bg-brand-surface p-4 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 text-lg font-semibold">პარამეტრები</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {/* Delivery toggle */}
            <button
              type="button"
              onClick={toggleDelivery}
              className="flex items-center gap-2 text-sm"
            >
              {foodService.has_delivery ? (
                <ToggleRight className="h-6 w-6 text-brand-accent" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-muted-foreground" />
              )}
              <Truck className="h-4 w-4" />
              <span>მიტანის სერვისი</span>
              <span
                className={`text-xs ${foodService.has_delivery ? "text-brand-success" : "text-muted-foreground"}`}
              >
                {foodService.has_delivery ? "ჩართულია" : "გამორთულია"}
              </span>
            </button>

            {/* Operating hours */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>სამუშაო საათები:</span>
              <span className="font-medium text-foreground">
                {foodService.operating_hours ?? "არ არის მითითებული"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Menu Management */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">მენიუ</h2>
          <Link
            href="/create/service?category=food"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
          >
            <Plus className="h-4 w-4" />
            ერთეულის დამატება
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : menuItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 p-8 text-center">
            <UtensilsCrossed className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">მენიუ ცარიელია</p>
          </div>
        ) : (
          <div className="space-y-2">
            {menuItems.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center justify-between rounded-xl bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div>
                  <h3 className="text-sm font-semibold">{item.name}</h3>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
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
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Current Orders Overview */}
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
      <h2 className="mb-3 text-lg font-semibold">დღევანდელი შეკვეთები</h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          დღეს შეკვეთები ჯერ არ არის
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 rounded-xl bg-brand-surface p-3 shadow-[var(--shadow-card)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {(order.sender as { display_name: string } | undefined)
                    ?.display_name ?? "კლიენტი"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
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
