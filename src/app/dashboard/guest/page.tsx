"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  Eye,
  CalendarCheck,
  Star,
  ArrowRight,
  Search,
  MessageSquare,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import type { Tables } from "@/lib/types/database";

type SmartMatchRequest = Tables<"smart_match_requests">;
type Property = Tables<"properties">;

const quickActions = [
  {
    label: "ობიექტის ძებნა",
    href: "/search",
    icon: Search,
    color: "bg-blue-100 text-blue-600",
  },
  {
    label: "Smart Match",
    href: "/dashboard/guest/bookings",
    icon: Sparkles,
    color: "bg-purple-100 text-purple-600",
  },
  {
    label: "შეტყობინებები",
    href: "/dashboard/notifications",
    icon: MessageSquare,
    color: "bg-green-100 text-green-600",
  },
  {
    label: "პროფილი",
    href: "/dashboard/guest/profile",
    icon: User,
    color: "bg-orange-100 text-orange-600",
  },
];

export default function GuestDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [smartMatches, setSmartMatches] = useState<SmartMatchRequest[]>([]);
  const [recentProperties, setRecentProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [profileRes, bookingsRes, reviewsRes, matchesRes, propertiesRes] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user!.id).single(),
          supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("guest_id", user!.id),
          supabase
            .from("reviews")
            .select("*", { count: "exact", head: true })
            .eq("guest_id", user!.id),
          supabase
            .from("smart_match_requests")
            .select("*")
            .eq("guest_id", user!.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(3),
          supabase
            .from("properties")
            .select("*")
            .eq("status", "active")
            .order("views_count", { ascending: false })
            .limit(4),
        ]);

      if (profileRes.data) setProfile(profileRes.data);
      setBookingsCount(bookingsRes.count ?? 0);
      setReviewsCount(reviewsRes.count ?? 0);
      if (matchesRes.data) setSmartMatches(matchesRes.data);
      if (propertiesRes.data) setRecentProperties(propertiesRes.data);
      setLoading(false);
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-foreground">
          გამარჯობა, {profile?.display_name ?? "სტუმარი"}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          კეთილი იყოს თქვენი მობრძანება MyBakuriani-ზე
        </p>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<CalendarCheck className="h-5 w-5" />}
          label="ჯავშნები"
          value={bookingsCount}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Star className="h-5 w-5" />}
          label="შეფასებები"
          value={reviewsCount}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Sparkles className="h-5 w-5" />}
          label="Smart Match"
          value={smartMatches.length}
          change={null}
          loading={loading}
        />
      </div>

      {/* Smart Match Alerts */}
      {smartMatches.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Smart Match შეტყობინებები
            </h2>
            <Link
              href="/dashboard/guest/bookings"
              className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
            >
              ყველა
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {smartMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {match.check_in} - {match.check_out}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {match.guests_count} სტუმარი
                      {match.budget_max
                        ? ` | ბიუჯეტი: ${match.budget_max} ₾`
                        : ""}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">
                  {match.matched_properties.length} შესატყვისი
                </Badge>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Quick Actions */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-foreground">
          სწრაფი მოქმედებები
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-md"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${action.color}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-center text-xs font-medium text-foreground">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </motion.section>

      {/* Recently Viewed / Popular Properties */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            პოპულარული ობიექტები
          </h2>
          <Link
            href="/search"
            className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
          >
            ყველა
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
                >
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <Skeleton className="mt-3 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))
            : recentProperties.map((property) => (
                <Link
                  key={property.id}
                  href={`/properties/${property.id}`}
                  className="group rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-md"
                >
                  <div className="relative h-32 overflow-hidden rounded-lg bg-muted">
                    {property.photos[0] && (
                      <Image
                        src={property.photos[0]}
                        alt={property.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                    {property.is_vip && (
                      <Badge className="absolute left-2 top-2 bg-amber-500 text-white">
                        VIP
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold text-foreground">
                    {property.title}
                  </h3>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {property.location}
                    </span>
                    <span className="text-sm font-bold text-brand-accent">
                      {property.price_per_night} ₾
                      <span className="text-xs font-normal text-muted-foreground">
                        /ღამე
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" />
                    {property.views_count} ნახვა
                  </div>
                </Link>
              ))}
        </div>
      </motion.section>
    </div>
  );
}
