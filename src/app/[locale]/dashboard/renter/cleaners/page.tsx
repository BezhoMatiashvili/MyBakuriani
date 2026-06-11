"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import { Phone, Calendar, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import CleanerCallModal from "@/components/renter/CleanerCallModal";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import type { Database, Tables } from "@/lib/types/database";

type PlatformCleaner =
  Database["public"]["Functions"]["get_platform_cleaners"]["Returns"][number];

type MyTask = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title"> | null;
};

type CallTarget = {
  cleaner: { cleanerId: string; name: string };
  prefill?: {
    propertyId?: string;
    cleaningType?: string;
    price?: number;
    address?: string;
    notes?: string;
  };
};

// Labels live in RenterCleaners.status.<status> messages.
const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-[#FEF3C7] text-[#D97706]",
  accepted: "bg-[#DCFCE7] text-[#16A34A]",
  in_progress: "bg-[#EFF6FF] text-[#2563EB]",
  completed: "bg-[#F0FDF4] text-[#15803D]",
  declined: "bg-[#FEF2F2] text-[#EF4444]",
};

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

export default function RenterCleanersPage() {
  const t = useTranslations("RenterCleaners");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const { user } = useAuth();
  const supabase = createClient();

  const [cleaners, setCleaners] = useState<PlatformCleaner[]>([]);
  const [cleanersLoaded, setCleanersLoaded] = useState(false);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [callModal, setCallModal] = useState<CallTarget | null>(null);

  const fetchCleaners = useCallback(async () => {
    const { data } = await supabase.rpc("get_platform_cleaners");
    if (data) setCleaners(data);
    setCleanersLoaded(true);
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("cleaning_tasks")
      .select("*, properties(title)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setTasks(data as MyTask[]);
    setTasksLoaded(true);
  }, [supabase, user]);

  useEffect(() => {
    fetchCleaners();
  }, [fetchCleaners]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("renter-cleaning-tasks-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cleaning_tasks",
          filter: `owner_id=eq.${user.id}`,
        },
        () => fetchTasks(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, fetchTasks]);

  function openCall(cleaner: PlatformCleaner) {
    setCallModal({
      cleaner: { cleanerId: cleaner.cleaner_id, name: cleaner.name },
    });
  }

  function redial(task: MyTask) {
    if (!task.cleaner_id) return;
    const name =
      cleaners.find((c) => c.cleaner_id === task.cleaner_id)?.name ??
      t("defaultCleaner");
    setCallModal({
      cleaner: { cleanerId: task.cleaner_id, name },
      prefill: {
        propertyId: task.property_id,
        cleaningType: task.cleaning_type,
        price: task.price ?? undefined,
        address: task.address ?? undefined,
        notes: task.notes ?? undefined,
      },
    });
  }

  // price_unit stores a DB code/label; resolve to a translated label.
  function priceUnitLabel(unit: string) {
    const path = priceUnitPathFor(unit);
    return path ? tOpts(path) : unit;
  }

  const visibleTasks = tasks.filter((task) => task.status !== "cancelled");

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitleEmpty")}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cleaners.map((cleaner) => (
          <article
            key={cleaner.service_id}
            className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center gap-3">
              {cleaner.avatar_url ? (
                <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src={cleaner.avatar_url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[13px] font-extrabold text-[#2563EB]">
                  {deriveInitials(cleaner.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
                  {cleaner.name}
                </p>
                {cleaner.phone && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
                    <Phone
                      className="h-3 w-3 text-[#EF4444]"
                      strokeWidth={2.4}
                    />
                    {cleaner.phone}
                  </p>
                )}
              </div>
              {cleaner.is_online && (
                <span className="inline-flex items-center rounded-lg bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-bold text-[#16A34A]">
                  {t("available")}
                </span>
              )}
            </div>

            {cleaner.price != null && (
              <p className="mt-3 text-[14px] font-black text-[#0F172A]">
                {formatPrice(Number(cleaner.price))}
                {cleaner.price_unit && (
                  <span className="text-[12px] font-semibold text-[#64748B]">
                    {" "}
                    / {priceUnitLabel(cleaner.price_unit)}
                  </span>
                )}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <a
                href={`tel:${cleaner.phone ?? ""}`}
                className="inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                {tShared("call")}
              </a>
              <button
                type="button"
                onClick={() => openCall(cleaner)}
                className="rounded-xl bg-[#2563EB] py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF]"
              >
                {t("callOut")}
              </button>
            </div>
          </article>
        ))}

        {cleanersLoaded && cleaners.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-[#E2E8F0] bg-white px-6 py-14 text-center sm:col-span-2 xl:col-span-3">
            <p className="text-sm font-medium text-[#64748B]">
              {t("noCleanersAvailable")}
            </p>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-3"
      >
        <h2 className="text-[20px] font-black text-[#0F172A]">
          {t("myCalls")}
        </h2>

        {visibleTasks.map((task) => {
          const badgeClass = STATUS_BADGE_CLASSES[task.status ?? ""];
          const cleaningKey = optionKeyFor("cleaningTypes", task.cleaning_type);
          return (
            <article
              key={task.id}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
                    {task.properties?.title ?? "—"}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
                    <Calendar className="h-3.5 w-3.5" strokeWidth={2.4} />
                    {formatDateTime(task.scheduled_at)}
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                    {cleaningKey
                      ? tOpts(`cleaningTypes.${cleaningKey}`)
                      : task.cleaning_type}
                    {task.price != null && (
                      <span className="font-bold text-[#0F172A]">
                        {" "}
                        · {formatPrice(Number(task.price))}
                      </span>
                    )}
                  </p>
                </div>
                {badgeClass && (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-[11px] font-bold ${badgeClass}`}
                  >
                    {t(`status.${task.status}`)}
                  </span>
                )}
              </div>

              {task.status === "declined" && task.cleaner_id && (
                <button
                  type="button"
                  onClick={() => redial(task)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
                  {t("redial")}
                </button>
              )}
            </article>
          );
        })}

        {tasksLoaded && visibleTasks.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-[#E2E8F0] bg-white px-6 py-14 text-center">
            <p className="text-sm font-medium text-[#64748B]">
              {t("noCallsYet")}
            </p>
          </div>
        )}
      </motion.div>

      <CleanerCallModal
        isOpen={callModal !== null}
        cleaner={callModal?.cleaner ?? null}
        prefill={callModal?.prefill}
        onClose={() => setCallModal(null)}
        onSent={fetchTasks}
      />
    </div>
  );
}
