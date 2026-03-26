"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Eye, Edit, Building, Search, MapPin, Ruler } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function SellerListingsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;

    async function fetchProperties() {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("owner_id", user!.id)
        .eq("is_for_sale", true)
        .order("created_at", { ascending: false });

      if (data) setProperties(data);
      setLoading(false);
    }

    fetchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filteredProperties = properties.filter(
    (p) =>
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            გასაყიდი ობიექტები
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            მართეთ თქვენი გასაყიდი ობიექტები
          </p>
        </div>
        <Link href="/create/sale">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            ახალი ობიექტი
          </Button>
        </Link>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="ობიექტის ძებნა..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>

      {/* Listings */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
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
        ) : filteredProperties.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-brand-surface py-16 shadow-[var(--shadow-card)]"
          >
            <Building className="h-12 w-12 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              ობიექტები ვერ მოიძებნა
            </p>
          </motion.div>
        ) : (
          filteredProperties.map((property, index) => (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-32">
                  {property.photos[0] && (
                    <Image
                      src={property.photos[0]}
                      alt={property.title}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {property.title}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {property.location}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[property.status] ?? ""}`}
                    >
                      {statusLabels[property.status] ?? property.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="text-lg font-bold text-brand-accent">
                      {property.sale_price?.toLocaleString()} ₾
                    </span>
                    {property.area_sqm && (
                      <span className="flex items-center gap-1">
                        <Ruler className="h-3 w-3" />
                        {property.area_sqm} მ²
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {property.views_count} ნახვა
                    </span>
                    {property.rooms && <span>{property.rooms} ოთახი</span>}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {property.is_vip && (
                      <Badge className="bg-amber-500 text-white">VIP</Badge>
                    )}
                    {property.roi_percent && (
                      <Badge variant="secondary">
                        ROI: {property.roi_percent}%
                      </Badge>
                    )}
                    {property.construction_status && (
                      <Badge variant="outline">
                        {property.construction_status}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 sm:flex-col">
                  <Link href={`/properties/${property.id}`}>
                    <Button variant="outline" size="icon-sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button variant="outline" size="icon-sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
