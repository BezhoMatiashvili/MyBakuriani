"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Eye,
  MessageSquareMore,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import StatCard from "@/components/cards/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import VIPBadge from "@/components/shared/VIPBadge";
import { useProperties } from "@/lib/hooks/useProperties";
import { useProfile } from "@/lib/hooks/useProfile";
import { formatPrice } from "@/lib/utils/format";
import { staggerChildren, slideUp } from "@/lib/utils/animations";
import { Skeleton } from "@/components/ui/skeleton";

export default function SellerDashboardPage() {
  const {
    properties,
    loading: propsLoading,
    list: listProperties,
  } = useProperties();
  const { profile, loading: profileLoading } = useProfile();

  useEffect(() => {
    listProperties({ isForSale: true });
  }, [listProperties]);

  const loading = propsLoading || profileLoading;

  // Stats
  const activeListings = properties.filter((p) => p.status === "active").length;
  const totalViews = properties.reduce((sum, p) => sum + p.views_count, 0);
  const inquiriesThisMonth = Math.floor(totalViews * 0.05); // simulated

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          გამარჯობა, {profile?.display_name ?? "გამყიდველი"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          თქვენი გაყიდვების პანელი
        </p>
      </div>

      {/* Stat cards */}
      <motion.div
        variants={staggerChildren}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <motion.div variants={slideUp}>
          <StatCard
            icon={<Building2 className="h-5 w-5" />}
            label="აქტიური განცხადებები"
            value={activeListings}
            change={null}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={slideUp}>
          <StatCard
            icon={<Eye className="h-5 w-5" />}
            label="ნახვები სულ"
            value={totalViews.toLocaleString()}
            change={15}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={slideUp}>
          <StatCard
            icon={<MessageSquareMore className="h-5 w-5" />}
            label="შეკითხვები ამ თვეში"
            value={inquiriesThisMonth}
            change={10}
            loading={loading}
          />
        </motion.div>
      </motion.div>

      {/* Sale properties list */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">გასაყიდი ქონება</h2>
          <Link
            href="/dashboard/seller/listings"
            className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:text-brand-accent-hover"
          >
            ყველა <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {propsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-brand-surface p-8 text-center shadow-[var(--shadow-card)]">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              გასაყიდი ქონება ჯერ არ დამატებულა
            </p>
            <Link
              href="/create/property"
              className="mt-3 inline-block rounded-lg bg-brand-accent px-5 py-2 text-sm font-medium text-white hover:bg-brand-accent-hover"
            >
              ქონების დამატება
            </Link>
          </div>
        ) : (
          <motion.div
            variants={staggerChildren}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {properties.map((prop) => (
              <motion.div
                key={prop.id}
                variants={slideUp}
                className="flex gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                {/* Photo */}
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={prop.photos[0] ?? "/placeholder-property.jpg"}
                    alt={prop.title}
                    fill
                    sizes="128px"
                    className="object-cover"
                  />
                  {(prop.is_vip || prop.is_super_vip) && (
                    <div className="absolute top-1.5 right-1.5">
                      <VIPBadge
                        level={prop.is_super_vip ? "super_vip" : "vip"}
                      />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {prop.title}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {prop.location}
                      </p>
                    </div>
                    <StatusBadge
                      status={prop.status as "active" | "blocked" | "pending"}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {prop.sale_price && (
                      <span className="text-sm font-bold text-foreground">
                        {formatPrice(prop.sale_price)}
                      </span>
                    )}
                    {prop.roi_percent != null && (
                      <span className="flex items-center gap-1 text-brand-success">
                        <TrendingUp className="h-3.5 w-3.5" />
                        ROI {prop.roi_percent}%
                      </span>
                    )}
                    {prop.construction_status && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {prop.construction_status}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {prop.views_count} ნახვა
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquareMore className="h-3.5 w-3.5" />
                      {Math.floor(prop.views_count * 0.05)} შეკითხვა
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Recent inquiries */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-foreground">
          ბოლო შეკითხვები
        </h2>
        <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 text-center shadow-[var(--shadow-card)]">
          <MessageSquareMore className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            შეკითხვები ჯერ არ არის
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            როდესაც მყიდველი დაინტერესდება თქვენი ქონებით, შეკითხვა აქ
            გამოჩნდება
          </p>
        </div>
      </div>
    </div>
  );
}
