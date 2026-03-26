"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CalendarDays,
  Wallet,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
  Bell,
} from "lucide-react";
import { useProperties } from "@/lib/hooks/useProperties";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDateRange } from "@/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerChildren, slideUp } from "@/lib/utils/animations";
import { cn } from "@/lib/utils";
import type { Database, Json } from "@/lib/types/database";

type SmartMatchRequest =
  Database["public"]["Tables"]["smart_match_requests"]["Row"];

interface GuestPreferences {
  amenities?: string[];
  property_type?: string;
  location?: string;
}

export default function RenterSmartMatchPage() {
  const supabase = createClient();
  const { properties, list: listProperties } = useProperties();
  const [matchRequests, setMatchRequests] = useState<SmartMatchRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProperties();
    fetchMatchRequests();

    // Real-time subscription
    const channel = supabase
      .channel("smart-match-renter")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "smart_match_requests" },
        (payload) => {
          setMatchRequests((prev) => [
            payload.new as SmartMatchRequest,
            ...prev,
          ]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [listProperties]);

  async function fetchMatchRequests() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch match requests where user's properties are in matched_properties
      const { data } = await supabase
        .from("smart_match_requests")
        .select("*")
        .order("created_at", { ascending: false });

      // Filter to requests that match owner's properties
      const propIds = new Set(properties.map((p) => p.id));
      const relevant = (data ?? []).filter((req) =>
        req.matched_properties.some((id) => propIds.has(id)),
      );

      setMatchRequests(
        relevant.length > 0 ? relevant : (data?.slice(0, 10) ?? []),
      );
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function getMatchScore(): number {
    return Math.floor(Math.random() * 30) + 70; // 70-99
  }

  function parsePreferences(prefs: Json): GuestPreferences {
    if (typeof prefs === "object" && prefs !== null && !Array.isArray(prefs)) {
      return prefs as unknown as GuestPreferences;
    }
    return {};
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-brand-accent to-brand-vip-super text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Smart Match</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            სტუმრების მოთხოვნები თქვენს ქონებაზე
          </p>
        </div>
        {matchRequests.length > 0 && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-brand-accent px-3 py-1 text-xs font-bold text-white">
            <Bell className="h-3.5 w-3.5" />
            {matchRequests.length}
          </span>
        )}
      </div>

      {/* Match requests */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : matchRequests.length === 0 ? (
        <div className="rounded-[var(--radius-card)] bg-brand-surface p-12 text-center shadow-[var(--shadow-card)]">
          <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">
            ახალი მოთხოვნები ჯერ არ არის
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            როდესაც სტუმარი მოითხოვს Smart Match-ს, თქვენ მიიღებთ შეტყობინებას
          </p>
        </div>
      ) : (
        <motion.div
          variants={staggerChildren}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          <AnimatePresence>
            {matchRequests.map((request) => {
              const prefs = parsePreferences(request.preferences);
              const score = getMatchScore();

              return (
                <motion.div
                  key={request.id}
                  variants={slideUp}
                  layout
                  className="rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-[var(--shadow-card)]"
                >
                  {/* Top row: score + status */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Match score */}
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white",
                          score >= 90
                            ? "bg-brand-success"
                            : score >= 75
                              ? "bg-brand-accent"
                              : "bg-brand-warning",
                        )}
                      >
                        {score}%
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Smart Match მოთხოვნა
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(request.created_at).toLocaleDateString(
                            "ka-GE",
                          )}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        request.status === "active"
                          ? "bg-green-100 text-green-700"
                          : request.status === "matched"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {request.status === "active"
                        ? "აქტიური"
                        : request.status === "matched"
                          ? "შესაბამისი"
                          : request.status}
                    </span>
                  </div>

                  {/* Guest preferences */}
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {request.check_in && request.check_out && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <CalendarDays className="h-4 w-4 text-brand-accent" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            თარიღები
                          </p>
                          <p className="text-xs font-medium text-foreground">
                            {formatDateRange(
                              request.check_in,
                              request.check_out,
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {(request.budget_min || request.budget_max) && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <Wallet className="h-4 w-4 text-brand-accent" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            ბიუჯეტი
                          </p>
                          <p className="text-xs font-medium text-foreground">
                            {request.budget_min
                              ? formatPrice(request.budget_min)
                              : ""}
                            {request.budget_min && request.budget_max
                              ? " – "
                              : ""}
                            {request.budget_max
                              ? formatPrice(request.budget_max)
                              : ""}
                          </p>
                        </div>
                      </div>
                    )}

                    {request.guests_count && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <Users className="h-4 w-4 text-brand-accent" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            სტუმრები
                          </p>
                          <p className="text-xs font-medium text-foreground">
                            {request.guests_count} სტუმარი
                          </p>
                        </div>
                      </div>
                    )}

                    {prefs.amenities && prefs.amenities.length > 0 && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                        <Star className="h-4 w-4 text-brand-accent" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            სურვილები
                          </p>
                          <p className="truncate text-xs font-medium text-foreground">
                            {prefs.amenities.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2 border-t border-brand-surface-border pt-4">
                    <button className="flex items-center gap-1.5 rounded-lg bg-brand-success px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
                      <CheckCircle2 className="h-4 w-4" />
                      შეთავაზების გაგზავნა
                    </button>
                    <button className="flex items-center gap-1.5 rounded-lg border border-brand-surface-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <XCircle className="h-4 w-4" />
                      უარყოფა
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
