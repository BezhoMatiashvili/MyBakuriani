"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  User,
  Truck,
  Clock,
  Check,
  ChefHat,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatusBadge from "@/components/shared/StatusBadge";
import Modal from "@/components/shared/Modal";
import { formatDate } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Message = Tables<"sms_messages"> & {
  sender?: { display_name: string; phone: string };
};

type FoodTab = "new" | "preparing" | "ready" | "delivered";

const tabs: { key: FoodTab; label: string; icon: React.ReactNode }[] = [
  { key: "new", label: "ახალი", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  {
    key: "preparing",
    label: "მზადდება",
    icon: <ChefHat className="h-3.5 w-3.5" />,
  },
  { key: "ready", label: "მზადაა", icon: <Package className="h-3.5 w-3.5" /> },
  {
    key: "delivered",
    label: "მიტანილი",
    icon: <Truck className="h-3.5 w-3.5" />,
  },
];

export default function FoodOrdersPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FoodTab>("new");
  const [orders, setOrders] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Message | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("sms_messages")
      .select(
        "*, sender:profiles!sms_messages_from_user_id_fkey(display_name, phone)",
      )
      .eq("to_user_id", user.id)
      .order("created_at", { ascending: false });

    setOrders((data as Message[]) ?? []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Real-time order notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("food-orders-page-rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `to_user_id=eq.${user.id}`,
        },
        () => {
          fetchOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchOrders]);

  // Tab filtering: new=unread, preparing/ready/delivered=read (simplified)
  const filtered = orders.filter((msg) => {
    if (activeTab === "new") return !msg.is_read;
    return msg.is_read;
  });

  async function markAsRead(id: string) {
    await supabase.from("sms_messages").update({ is_read: true }).eq("id", id);
    setOrders((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)),
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">კვების შეკვეთები</h1>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-brand-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === "new" && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs text-white">
                {orders.filter((m) => !m.is_read).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 p-8 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            შეკვეთები არ არის
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-xl border sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    მომხმარებელი
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    შეკვეთა
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    მიტანა/წაღება
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    დრო
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    სტატუსი
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    მოქმედება
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, idx) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {(order.sender as { display_name: string } | undefined)
                        ?.display_name ?? "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-muted-foreground">
                      {order.message}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Truck className="h-3 w-3" /> მიტანა
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={order.is_read ? "active" : "pending"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="text-sm font-medium text-brand-accent hover:underline"
                      >
                        დეტალები
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 sm:hidden">
            {filtered.map((order, idx) => (
              <motion.button
                key={order.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => setSelectedOrder(order)}
                className="flex w-full items-center gap-3 rounded-xl bg-brand-surface p-4 text-left shadow-[var(--shadow-card)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {(order.sender as { display_name: string } | undefined)
                        ?.display_name ?? "კლიენტი"}
                    </span>
                    <StatusBadge
                      status={order.is_read ? "active" : "pending"}
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {order.message}
                  </p>
                </div>
                {!order.is_read && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-accent" />
                )}
              </motion.button>
            ))}
          </div>
        </>
      )}

      {/* Order Detail Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <Modal
            isOpen={!!selectedOrder}
            onClose={() => setSelectedOrder(null)}
            title="შეკვეთის დეტალები"
            size="md"
          >
            <div className="space-y-5">
              {/* Customer info */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    {(
                      selectedOrder.sender as
                        | { display_name: string }
                        | undefined
                    )?.display_name ?? "კლიენტი"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedOrder.sender as { phone: string } | undefined)
                      ?.phone ?? ""}
                  </p>
                </div>
              </div>

              {/* Order details */}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  შეკვეთა
                </p>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  {selectedOrder.message}
                </div>
              </div>

              {/* Time */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDate(selectedOrder.created_at)}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={selectedOrder.is_read ? "active" : "pending"}
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {!selectedOrder.is_read && (
                  <button
                    type="button"
                    onClick={() => {
                      markAsRead(selectedOrder.id);
                      setSelectedOrder({
                        ...selectedOrder,
                        is_read: true,
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
                  >
                    <Check className="h-4 w-4" />
                    მიღება
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600"
                >
                  <ChefHat className="h-4 w-4" />
                  მომზადება
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600"
                >
                  <Package className="h-4 w-4" />
                  მზადაა
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Truck className="h-4 w-4" />
                  მიტანილია
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
