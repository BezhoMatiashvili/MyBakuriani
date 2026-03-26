"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Eye,
  MessageSquare,
  Star,
  Plus,
  MoreVertical,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

export default function ServiceDashboardPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeListings: 0,
    totalViews: 0,
    inquiriesThisMonth: 0,
    rating: 0,
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: svcData } = await supabase
      .from("services")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    const myServices = svcData ?? [];
    setServices(myServices);

    const activeCount = myServices.filter((s) => s.status === "active").length;
    const totalViews = myServices.reduce((sum, s) => sum + s.views_count, 0);

    const { data: profile } = await supabase
      .from("profiles")
      .select("rating")
      .eq("id", user.id)
      .single();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: inquiryCount } = await supabase
      .from("sms_messages")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .gte("created_at", startOfMonth.toISOString());

    setStats({
      activeListings: activeCount,
      totalViews: totalViews,
      inquiriesThisMonth: inquiryCount ?? 0,
      rating: profile?.rating ?? 0,
    });

    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("service-inquiries")
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

  const statusMap = (
    s: string,
  ): "active" | "blocked" | "pending" | "verified" => {
    if (s === "active") return "active";
    if (s === "blocked") return "blocked";
    if (s === "draft") return "pending";
    return "pending";
  };

  const categoryLabels: Record<string, string> = {
    entertainment: "\u10D2\u10D0\u10E0\u10D7\u10DD\u10D1\u10D0",
    transport: "\u10E2\u10E0\u10D0\u10DC\u10E1\u10DE\u10DD\u10E0\u10E2\u10D8",
    employment: "\u10D3\u10D0\u10E1\u10D0\u10E5\u10DB\u10D4\u10D1\u10D0",
    handyman: "\u10EE\u10D4\u10DA\u10DD\u10E1\u10D0\u10DC\u10D8",
    cleaning: "\u10D3\u10D0\u10DA\u10D0\u10D2\u10D4\u10D1\u10D0",
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{"\u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D4\u10D1\u10D8\u10E1 \u10D9\u10D0\u10D1\u10D8\u10DC\u10D4\u10E2\u10D8"}</h1>
        <Link
          href="/create/service"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-accent/90"
        >
          <Plus className="h-4 w-4" />
          {"\u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D8\u10E1 \u10D3\u10D0\u10DB\u10D0\u10E2\u10D4\u10D1\u10D0"}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          icon={<Briefcase className="h-5 w-5" />}
          label={"\u10D0\u10E5\u10E2\u10D8\u10E3\u10E0\u10D8 \u10D2\u10D0\u10DC\u10EA\u10EE\u10D0\u10D3\u10D4\u10D1\u10D4\u10D1\u10D8"}
          value={stats.activeListings}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Eye className="h-5 w-5" />}
          label={"\u10DC\u10D0\u10EE\u10D5\u10D4\u10D1\u10D8 \u10E1\u10E3\u10DA"}
          value={stats.totalViews}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          label={"\u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8 \u10D0\u10DB \u10D7\u10D5\u10D4\u10E8\u10D8"}
          value={stats.inquiriesThisMonth}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Star className="h-5 w-5" />}
          label={"\u10E0\u10D4\u10D8\u10E2\u10D8\u10DC\u10D2\u10D8"}
          value={stats.rating ? stats.rating.toFixed(1) : "\u2014"}
          change={null}
          loading={loading}
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{"\u10E9\u10D4\u10DB\u10D8 \u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D4\u10D1\u10D8"}</h2>
          <Link
            href="/dashboard/service/orders"
            className="text-sm font-medium text-brand-accent hover:underline"
          >
            {"\u10E8\u10D4\u10D9\u10D5\u10D4\u10D7\u10D4\u10D1\u10D8"} →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 p-8 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {"\u10EF\u10D4\u10E0 \u10D0\u10E0 \u10D2\u10D0\u10E5\u10D5\u10D7 \u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D4\u10D1\u10D8"}
            </p>
            <Link
              href="/create/service"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              {"\u10D3\u10D0\u10D0\u10DB\u10D0\u10E2\u10D4\u10D7 \u10DE\u10D8\u10E0\u10D5\u10D4\u10DA\u10D8 \u10E1\u10D4\u10E0\u10D5\u10D8\u10E1\u10D8"}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service, idx) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-4 rounded-xl bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {service.photos[0] ? (
                    <img
                      src={service.photos[0]}
                      alt={service.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Briefcase className="h-5 w-5" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {service.title}
                    </h3>
                    <StatusBadge status={statusMap(service.status)} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {categoryLabels[service.category] ?? service.category}
                    </span>
                    {service.price != null && (
                      <span className="font-medium text-foreground">
                        {formatPrice(service.price)}
                        {service.price_unit && ` / ${service.price_unit}`}
                      </span>
                    )}
                    <span>{service.views_count} {"\u10DC\u10D0\u10EE\u10D5\u10D0"}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <RecentInquiries userId={user?.id} />
    </div>
  );
}

function RecentInquiries({ userId }: { userId: string | undefined }) {
  const supabase = createClient();
  const [messages, setMessages] = useState<
    (Tables<"sms_messages"> & { sender?: { display_name: string } })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    async function load() {
      const { data } = await supabase
        .from("sms_messages")
        .select(
          "*, sender:profiles!sms_messages_from_user_id_fkey(display_name)",
        )
        .eq("to_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(5);

      setMessages((data as typeof messages) ?? []);
      setLoading(false);
    }

    load();
  }, [userId, supabase]);

  if (loading) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold">{"\u10D1\u10DD\u10DA\u10DD \u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8"}</h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold">{"\u10D1\u10DD\u10DA\u10DD \u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8"}</h2>
        <p className="text-sm text-muted-foreground">{"\u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8 \u10EF\u10D4\u10E0 \u10D0\u10E0 \u10D0\u10E0\u10D8\u10E1"}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{"\u10D1\u10DD\u10DA\u10DD \u10E8\u10D4\u10D9\u10D8\u10D7\u10EE\u10D5\u10D4\u10D1\u10D8"}</h2>
      <div className="space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex items-center gap-3 rounded-xl bg-brand-surface p-3 shadow-[var(--shadow-card)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {(msg.sender as { display_name: string } | undefined)
                  ?.display_name ?? "\u10DB\u10DD\u10DB\u10EE\u10DB\u10D0\u10E0\u10D4\u10D1\u10D4\u10DA\u10D8"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {msg.message}
              </p>
            </div>
            {!msg.is_read && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-accent" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
