"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building, Eye, MessageSquare, ArrowRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import StatCard from "@/components/cards/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

const statusLabels: Record<string, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილი",
  pending: "მოლოდინში",
  draft: "დრაფტი",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-700",
};

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [inquiriesCount, setInquiriesCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      const [profileRes, propertiesRes, inquiriesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).single(),
        supabase
          .from("properties")
          .select("*")
          .eq("owner_id", user!.id)
          .eq("is_for_sale", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("sms_messages")
          .select("*", { count: "exact", head: true })
          .eq("to_user_id", user!.id),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (propertiesRes.data) {
        setProperties(propertiesRes.data);
        setTotalViews(
          propertiesRes.data.reduce((sum, p) => sum + (p.views_count ?? 0), 0),
        );
      }
      setInquiriesCount(inquiriesRes.count ?? 0);
      setLoading(false);
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-8 p-6 sm:p-8 lg:p-12">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
          გამარჯობა, {profile?.display_name ?? "გამყიდველი"}!
        </h1>
        <p className="text-sm font-medium text-[#64748B]">
          თქვენი გასაყიდი ობიექტების მართვა
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Building className="h-5 w-5" />}
          label="გასაყიდი ობიექტები"
          value={properties.length}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<Eye className="h-5 w-5" />}
          label="სულ ნახვები"
          value={totalViews}
          change={null}
          loading={loading}
        />
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="შეკითხვები"
          value={inquiriesCount}
          change={null}
          loading={loading}
        />
      </div>

      {/* Properties */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1E293B]">
            ჩემი ობიექტები
          </h2>
          <div className="flex items-center gap-3">
            <Link href="/create/sale">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                ახალი
              </Button>
            </Link>
            <Link
              href="/dashboard/seller/listings"
              className="flex items-center gap-1 text-sm text-brand-accent hover:underline"
            >
              ყველა
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
              >
                <div className="flex gap-4">
                  <Skeleton className="h-24 w-24 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
              <Building className="h-12 w-12 text-[#94A3B8]" />
              <p className="mt-3 text-sm text-[#94A3B8]">
                გასაყიდი ობიექტები ჯერ არ გაქვთ
              </p>
              <Link href="/create/sale" className="mt-4">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  დაამატეთ ობიექტი
                </Button>
              </Link>
            </div>
          ) : (
            properties.map((property) => (
              <div
                key={property.id}
                className="flex flex-col gap-4 rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:flex-row"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[#F8FAFC]">
                  {(property.photos ?? [])[0] && (
                    <Image
                      src={(property.photos ?? [])[0]}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-[#1E293B]">
                      {property.title}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[property.status ?? "draft"] ?? ""}`}
                    >
                      {statusLabels[property.status ?? "draft"] ??
                        property.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">
                    {property.location}
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <span className="text-lg font-bold text-brand-accent">
                      {formatPrice(Number(property.sale_price ?? 0))}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                      <Eye className="h-3 w-3" />
                      {property.views_count}
                    </span>
                    {property.area_sqm && (
                      <span className="text-xs text-[#94A3B8]">
                        {property.area_sqm} მ²
                      </span>
                    )}
                  </div>
                  {property.is_vip && (
                    <Badge className="mt-2 bg-amber-500 text-white">VIP</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
