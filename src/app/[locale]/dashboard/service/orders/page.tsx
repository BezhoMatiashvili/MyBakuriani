"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  User,
  Calendar,
  Check,
  X as XIcon,
  Clock,
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

type OrderTab = "new" | "processed";

const tabs: { key: OrderTab; label: string }[] = [
  { key: "new", label: "\u10D0\u10EE\u10D0\u10DA\u10D8" },
  {
    key: "processed",
    label:
      "\u10D3\u10D0\u10DB\u10E3\u10E8\u10D0\u10D5\u10D4\u10D1\u10E3\u10DA\u10D8",
  },
];

export default function ServiceOrdersPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<OrderTab>("new");
  const [messages, setMessages] = useState<Message[]>([]);
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

    setMessages((data as Message[]) ?? []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("service-orders-rt")
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

  const filtered = messages.filter((msg) => {
    return activeTab === "new" ? !msg.is_read : msg.is_read;
  });

  async function markAsRead(id: string) {
    await supabase.from("sms_messages").update({ is_read: true }).eq("id", id);
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)),
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
        {
          "\u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8 / \u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8"
        }
      </h1>

      <div className="flex gap-1 rounded-xl bg-[#F8FAFC] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-brand-surface text-[#1E293B] shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                : "text-[#94A3B8] hover:text-[#1E293B]"
            }`}
          >
            {tab.label}
            {tab.key === "new" && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-xs text-white">
                {messages.filter((m) => !m.is_read).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-[#F8FAFC]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#64748B]/30 p-8 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-[#94A3B8]/50" />
          <p className="mt-2 text-sm text-[#94A3B8]">
            {activeTab === "new"
              ? "\u10D0\u10EE\u10D0\u10DA\u10D8 \u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8 \u10D0\u10E0 \u10D0\u10E0\u10D8\u10E1"
              : "\u10D3\u10D0\u10DB\u10E3\u10E8\u10D0\u10D5\u10D4\u10D1\u10E3\u10DA\u10D8 \u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8 \u10D0\u10E0 \u10D0\u10E0\u10D8\u10E1"}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[#F8FAFC] text-left">
                  <th className="px-4 py-3 font-medium text-[#94A3B8]">
                    {"\u10D9\u10DA\u10D8\u10D4\u10DC\u10E2\u10D8"}
                  </th>
                  <th className="px-4 py-3 font-medium text-[#94A3B8]">
                    {
                      "\u10E8\u10D4\u10E2\u10E7\u10DD\u10D1\u10D8\u10DC\u10D4\u10D1\u10D0"
                    }
                  </th>
                  <th className="px-4 py-3 font-medium text-[#94A3B8]">
                    {"\u10D7\u10D0\u10E0\u10D8\u10E6\u10D8"}
                  </th>
                  <th className="px-4 py-3 font-medium text-[#94A3B8]">
                    {"\u10E1\u10E2\u10D0\u10E2\u10E3\u10E1\u10D8"}
                  </th>
                  <th className="px-4 py-3 font-medium text-[#94A3B8]">
                    {"\u10DB\u10DD\u10E5\u10DB\u10D4\u10D3\u10D4\u10D1\u10D0"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((msg, idx) => (
                  <motion.tr
                    key={msg.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b last:border-0 hover:bg-[#F8FAFC]/60"
                  >
                    <td className="px-4 py-3 font-medium">
                      {(msg.sender as { display_name: string } | undefined)
                        ?.display_name ?? "\u2014"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-[#94A3B8]">
                      {msg.message}
                    </td>
                    <td className="px-4 py-3 text-[#94A3B8]">
                      {formatDate(msg.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={msg.is_read ? "active" : "pending"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(msg)}
                        className="text-sm font-medium text-brand-accent hover:underline"
                      >
                        {"\u10DC\u10D0\u10EE\u10D5\u10D0"}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 sm:hidden">
            {filtered.map((msg, idx) => (
              <motion.button
                key={msg.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => setSelectedOrder(msg)}
                className="flex w-full items-center gap-3 rounded-xl bg-brand-surface p-4 text-left shadow-[var(--shadow-card)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {(msg.sender as { display_name: string } | undefined)
                        ?.display_name ?? "\u2014"}
                    </span>
                    <StatusBadge status={msg.is_read ? "active" : "pending"} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                    {msg.message}
                  </p>
                </div>
                {!msg.is_read && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-accent" />
                )}
              </motion.button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {selectedOrder && (
          <Modal
            isOpen={!!selectedOrder}
            onClose={() => setSelectedOrder(null)}
            title={
              "\u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D8\u10E1 \u10D3\u10D4\u10E2\u10D0\u10DA\u10D4\u10D1\u10D8"
            }
            size="md"
          >
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">
                    {(
                      selectedOrder.sender as
                        | { display_name: string }
                        | undefined
                    )?.display_name ??
                      "\u10DB\u10DD\u10DB\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D4\u10DA\u10D8"}
                  </p>
                  <p className="text-sm text-[#94A3B8]">
                    {(selectedOrder.sender as { phone: string } | undefined)
                      ?.phone ?? ""}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-[#94A3B8]">
                  {
                    "\u10E8\u10D4\u10E2\u10E7\u10DD\u10D1\u10D8\u10DC\u10D4\u10D1\u10D0"
                  }
                </p>
                <div className="rounded-lg bg-[#F8FAFC] p-3 text-sm">
                  {selectedOrder.message}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
                <Calendar className="h-4 w-4" />
                {formatDate(selectedOrder.created_at)}
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#94A3B8]" />
                <StatusBadge
                  status={selectedOrder.is_read ? "active" : "pending"}
                />
              </div>

              <div className="flex gap-3 border-t pt-4">
                {!selectedOrder.is_read && (
                  <button
                    type="button"
                    onClick={() => {
                      markAsRead(selectedOrder.id);
                      setSelectedOrder({ ...selectedOrder, is_read: true });
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
                  >
                    <Check className="h-4 w-4" />
                    {"\u10DB\u10D8\u10E6\u10D4\u10D1\u10D0"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#F8FAFC]"
                >
                  <XIcon className="h-4 w-4" />
                  {"\u10D3\u10D0\u10EE\u10E3\u10E0\u10D5\u10D0"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
