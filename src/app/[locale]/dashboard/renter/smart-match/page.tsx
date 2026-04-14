"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  CalendarDays,
  Users,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Inbox,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type SmartMatchRequest = Tables<"smart_match_requests"> & {
  profiles: Pick<
    Tables<"profiles">,
    "display_name" | "phone" | "avatar_url"
  > | null;
};

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  active: {
    label: "აქტიური",
    color: "bg-green-100 text-green-700",
    icon: Clock,
  },
  matched: {
    label: "შესატყვისი",
    color: "bg-brand-accent-light text-brand-accent",
    icon: CheckCircle,
  },
  closed: {
    label: "დახურული",
    color: "bg-gray-100 text-gray-700",
    icon: XCircle,
  },
};

export default function RenterSmartMatchPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [requests, setRequests] = useState<SmartMatchRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchRequests() {
      // Fetch smart match requests that might be relevant to this renter's properties
      const { data: properties } = await supabase
        .from("properties")
        .select("id")
        .eq("owner_id", user!.id);

      if (!properties || properties.length === 0) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("smart_match_requests")
        .select("*, profiles(display_name, phone, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) setRequests(data as SmartMatchRequest[]);
      setLoading(false);
    }

    fetchRequests();

    // Realtime updates
    const channel = supabase
      .channel("smart-match-inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "smart_match_requests",
        },
        () => {
          fetchRequests();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          Smart Match
        </h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">
          სტუმრების მოთხოვნები რომლებიც შეესატყვისება თქვენს ობიექტებს
        </p>
      </motion.div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "აქტიური მოთხოვნები",
            value: requests.filter((r) => r.status === "active").length,
            color: "bg-green-100 text-green-600",
          },
          {
            label: "შესატყვისი",
            value: requests.filter((r) => r.status === "matched").length,
            color: "bg-brand-accent-light text-brand-accent",
          },
          {
            label: "სულ მოთხოვნები",
            value: requests.length,
            color: "bg-purple-100 text-purple-600",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <p className="text-xs text-[#94A3B8]">{stat.label}</p>
            <div className="mt-1 text-2xl font-bold text-[#1E293B]">
              {loading ? <Skeleton className="h-8 w-12" /> : stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
            >
              <div className="space-y-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))
        ) : requests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
          >
            <Inbox className="h-12 w-12 text-[#94A3B8]" />
            <p className="mt-3 text-sm text-[#94A3B8]">
              ახალი მოთხოვნები ჯერ არ არის
            </p>
          </motion.div>
        ) : (
          requests.map((request, index) => {
            const config =
              statusConfig[request.status ?? "active"] ?? statusConfig.active;
            const StatusIcon = config.icon;

            return (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#1E293B]">
                        {request.profiles?.display_name ?? "სტუმარი"}
                      </h3>
                      <p className="text-[10px] text-[#94A3B8]">
                        {new Date(request.created_at ?? "").toLocaleDateString(
                          "ka-GE",
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#94A3B8]">
                  {request.check_in && request.check_out && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {request.check_in} — {request.check_out}
                    </span>
                  )}
                  {request.guests_count && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {request.guests_count} სტუმარი
                    </span>
                  )}
                  {(request.budget_min || request.budget_max) && (
                    <span className="flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5" />
                      {formatPrice(Number(request.budget_min ?? 0))} —{" "}
                      {request.budget_max
                        ? formatPrice(Number(request.budget_max))
                        : "∞"}
                    </span>
                  )}
                </div>

                {(request.matched_properties ?? []).length > 0 && (
                  <div className="mt-2">
                    <Badge variant="secondary">
                      {(request.matched_properties ?? []).length} შესატყვისი
                      ობიექტი
                    </Badge>
                  </div>
                )}

                {request.status === "active" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm">შეთავაზება</Button>
                    <Button size="sm" variant="outline">
                      გამოტოვება
                    </Button>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
