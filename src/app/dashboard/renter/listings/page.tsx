"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  Pencil,
  Power,
  Rocket,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import StatusBadge from "@/components/shared/StatusBadge";
import VIPBadge from "@/components/shared/VIPBadge";
import { useProperties } from "@/lib/hooks/useProperties";
import { formatPrice } from "@/lib/utils/format";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerChildren, slideUp } from "@/lib/utils/animations";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type Property = Database["public"]["Tables"]["properties"]["Row"];

export default function RenterListingsPage() {
  const { properties, loading, list } = useProperties();
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  useEffect(() => {
    list();
  }, [list]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            ჩემი განცხადებები
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {properties.length} განცხადება
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-brand-surface-border">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-1 rounded-l-lg px-3 py-2 text-sm transition-colors",
                viewMode === "grid"
                  ? "bg-brand-accent text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1 rounded-r-lg px-3 py-2 text-sm transition-colors",
                viewMode === "table"
                  ? "bg-brand-accent text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Link
            href="/create/property"
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-accent-hover"
          >
            <Plus className="h-4 w-4" />
            დამატება
          </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="rounded-[var(--radius-card)] bg-brand-surface p-12 text-center shadow-[var(--shadow-card)]">
          <p className="text-lg text-muted-foreground">
            განცხადება ჯერ არ დამატებულა
          </p>
          <Link
            href="/create/property"
            className="mt-4 inline-block rounded-lg bg-brand-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-accent-hover"
          >
            პირველი განცხადების დამატება
          </Link>
        </div>
      ) : viewMode === "grid" ? (
        <GridView properties={properties} />
      ) : (
        <TableView properties={properties} />
      )}
    </div>
  );
}

function GridView({ properties }: { properties: Property[] }) {
  return (
    <motion.div
      variants={staggerChildren}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {properties.map((prop) => (
        <motion.div
          key={prop.id}
          variants={slideUp}
          className="overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
        >
          <div className="relative aspect-[16/9] overflow-hidden">
            <Image
              src={prop.photos[0] ?? "/placeholder-property.jpg"}
              alt={prop.title}
              fill
              sizes="(max-width: 640px) 100vw, 33vw"
              className="object-cover"
            />
            <div className="absolute top-2 left-2">
              <StatusBadge
                status={prop.status as "active" | "blocked" | "pending"}
              />
            </div>
            <div className="absolute top-2 right-2 flex gap-1.5">
              {prop.is_super_vip && <VIPBadge level="super_vip" />}
              {prop.is_vip && !prop.is_super_vip && <VIPBadge level="vip" />}
            </div>
          </div>

          <div className="p-4">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {prop.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {prop.location}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                {prop.price_per_night
                  ? formatPrice(prop.price_per_night) + " / ღამე"
                  : ""}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                {prop.views_count}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2 border-t border-brand-surface-border pt-3">
              <button className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
                რედაქტირება
              </button>
              <button className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Power className="h-3.5 w-3.5" />
                სტატუსი
              </button>
              <Link
                href="/dashboard/renter/balance"
                className="ml-auto flex items-center gap-1 rounded-md bg-brand-accent-light px-2.5 py-1.5 text-xs font-medium text-brand-accent transition-colors hover:bg-brand-accent hover:text-white"
              >
                <Rocket className="h-3.5 w-3.5" />
                VIP
              </Link>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function TableView({ properties }: { properties: Property[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-brand-surface-border text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">ქონება</th>
            <th className="px-4 py-3">სტატუსი</th>
            <th className="px-4 py-3">ფასი</th>
            <th className="px-4 py-3">ნახვები</th>
            <th className="px-4 py-3">VIP</th>
            <th className="px-4 py-3">მოქმედება</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((prop) => (
            <tr
              key={prop.id}
              className="border-b border-brand-surface-border last:border-0"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={prop.photos[0] ?? "/placeholder-property.jpg"}
                      alt={prop.title}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {prop.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {prop.location}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={prop.status as "active" | "blocked" | "pending"}
                />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-foreground">
                {prop.price_per_night ? formatPrice(prop.price_per_night) : "—"}
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  {prop.views_count}
                </span>
              </td>
              <td className="px-4 py-3">
                {prop.is_super_vip ? (
                  <VIPBadge level="super_vip" />
                ) : prop.is_vip ? (
                  <VIPBadge level="vip" />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Power className="h-4 w-4" />
                  </button>
                  <Link
                    href="/dashboard/renter/balance"
                    className="rounded-md p-1.5 text-brand-accent transition-colors hover:bg-brand-accent-light"
                  >
                    <Rocket className="h-4 w-4" />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
