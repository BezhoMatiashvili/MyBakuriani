"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Phone,
  Calendar,
  RotateCcw,
  UserPlus,
  Pencil,
  Trash2,
  X,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import CleanerCallModal from "@/components/renter/CleanerCallModal";
import AddCleanerModal from "@/components/renter/AddCleanerModal";
import CleanerFormModal from "@/components/renter/CleanerFormModal";
import { CallButton } from "@/components/shared/CallButton";
import { formatDateTime, formatPrice } from "@/lib/utils/format";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import type { Database, Tables } from "@/lib/types/database";

type PlatformCleaner =
  Database["public"]["Functions"]["get_platform_cleaners"]["Returns"][number];

type ManualCleaner = Tables<"renter_cleaners">;

// The grid mixes saved platform cleaners and the renter's own manual entries.
type GridCleaner =
  | { kind: "platform"; data: PlatformCleaner }
  | { kind: "manual"; data: ManualCleaner };

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
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualCleaners, setManualCleaners] = useState<ManualCleaner[]>([]);
  const [manualLoaded, setManualLoaded] = useState(false);
  const [formModal, setFormModal] = useState<{
    open: boolean;
    cleaner: ManualCleaner | null;
  }>({ open: false, cleaner: null });
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [callModal, setCallModal] = useState<CallTarget | null>(null);

  const fetchCleaners = useCallback(async () => {
    const { data } = await supabase.rpc("get_platform_cleaners");
    if (data) setCleaners(data);
    setCleanersLoaded(true);
  }, [supabase]);

  // cleaner_id -> distinct renters this cleaner has served. Cross-renter
  // aggregate, so it must come from the SECURITY DEFINER RPC (RLS would
  // otherwise cap a client COUNT to this renter's own rows).
  const [renterCounts, setRenterCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const fetchRenterCounts = useCallback(async () => {
    const { data } = await supabase.rpc("get_cleaner_renter_counts");
    if (data) {
      setRenterCounts(
        new Map(data.map((row) => [row.cleaner_id, row.renters_served])),
      );
    }
  }, [supabase]);

  // Bumped on every toggle so an in-flight refetch can't clobber newer state.
  const savedVersion = useRef(0);

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    const version = savedVersion.current;
    const { data } = await supabase
      .from("renter_saved_cleaners")
      .select("cleaner_id")
      .eq("owner_id", user.id);
    if (data && savedVersion.current === version) {
      setSavedIds(new Set(data.map((row) => row.cleaner_id)));
    }
    setSavedLoaded(true);
  }, [supabase, user]);

  // Optimistic add/remove of a cleaner in the renter's list, with rollback.
  // Returns false when the write failed so the dialog can surface it.
  const toggleSaved = useCallback(
    async (cleanerId: string, save: boolean) => {
      if (!user) return false;
      savedVersion.current += 1;
      const apply = (ids: Set<string>, add: boolean) => {
        const next = new Set(ids);
        if (add) next.add(cleanerId);
        else next.delete(cleanerId);
        return next;
      };
      setSavedIds((prev) => apply(prev, save));
      const { error } = save
        ? await supabase
            .from("renter_saved_cleaners")
            .upsert(
              { owner_id: user.id, cleaner_id: cleanerId },
              { onConflict: "owner_id,cleaner_id", ignoreDuplicates: true },
            )
        : await supabase
            .from("renter_saved_cleaners")
            .delete()
            .eq("owner_id", user.id)
            .eq("cleaner_id", cleanerId);
      if (error) {
        setSavedIds((prev) => apply(prev, !save));
        return false;
      }
      return true;
    },
    [supabase, user],
  );

  const fetchManualCleaners = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("renter_cleaners")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setManualCleaners(data);
    setManualLoaded(true);
  }, [supabase, user]);

  // Hard-delete the renter's own manual cleaner, optimistic with rollback.
  const deleteManual = useCallback(
    async (id: string) => {
      if (!user) return;
      if (!window.confirm(t("deleteConfirm"))) return;
      const snapshot = manualCleaners;
      setManualCleaners((prev) => prev.filter((c) => c.id !== id));
      const { error } = await supabase
        .from("renter_cleaners")
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);
      if (error) setManualCleaners(snapshot);
    },
    [supabase, user, manualCleaners, t],
  );

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
    fetchRenterCounts();
  }, [fetchRenterCounts]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  useEffect(() => {
    fetchManualCleaners();
  }, [fetchManualCleaners]);

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
        () => {
          fetchTasks();
          fetchRenterCounts();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, fetchTasks, fetchRenterCounts]);

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

  // One entry per person (a cleaner may list several cleaning services);
  // the deduped list feeds both the grid and the add dialog so they agree.
  const uniqueCleaners = cleaners.filter(
    (c, i) => cleaners.findIndex((o) => o.cleaner_id === c.cleaner_id) === i,
  );
  // Only platform cleaners the renter added themselves.
  const myCleaners = uniqueCleaners.filter((c) => savedIds.has(c.cleaner_id));
  // Unified grid: saved platform cleaners + the renter's own manual entries.
  const gridCleaners: GridCleaner[] = [
    ...myCleaners.map((c) => ({ kind: "platform" as const, data: c })),
    ...manualCleaners.map((c) => ({ kind: "manual" as const, data: c })),
  ];
  const listReady = cleanersLoaded && savedLoaded && manualLoaded;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitleEmpty")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0F172A] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2.4} />
          {tShared("add")}
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {gridCleaners.map((item) => {
          if (item.kind === "manual") {
            const c = item.data;
            const hasPrice =
              c.price_standard != null || c.price_general != null;
            return (
              <article
                key={`manual-${c.id}`}
                className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[13px] font-extrabold text-[#4F46E5]">
                    {deriveInitials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold text-[#0F172A]">
                      {c.name}
                    </p>
                    {c.phone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
                        <Phone
                          className="h-3 w-3 text-[#EF4444]"
                          strokeWidth={2.4}
                        />
                        {c.phone}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center rounded-lg bg-[#EEF2FF] px-3 py-1.5 text-[11px] font-bold text-[#4F46E5]">
                    {t("personalBadge")}
                  </span>
                </div>

                {hasPrice && (
                  <p className="mt-3 text-[14px] font-black text-[#0F172A]">
                    {c.price_standard != null && (
                      <>
                        <span className="text-[12px] font-semibold text-[#64748B]">
                          {t("priceStandardShort")}{" "}
                        </span>
                        {formatPrice(Number(c.price_standard))}
                      </>
                    )}
                    {c.price_standard != null && c.price_general != null && (
                      <span className="text-[12px] font-semibold text-[#64748B]">
                        {" · "}
                      </span>
                    )}
                    {c.price_general != null && (
                      <>
                        <span className="text-[12px] font-semibold text-[#64748B]">
                          {t("priceGeneralShort")}{" "}
                        </span>
                        {formatPrice(Number(c.price_general))}
                      </>
                    )}
                  </p>
                )}

                <div className="mt-5 flex items-center gap-2">
                  <CallButton phone={c.phone} label={tShared("call")} alwaysShowLabel layout="card" className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setFormModal({ open: true, cleaner: c })}
                    aria-label={tShared("edit")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F3E8FF] text-[#9333EA] transition-colors hover:bg-[#E9D5FF]"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteManual(c.id)}
                    aria-label={tShared("delete")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA]"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                </div>
              </article>
            );
          }

          const cleaner = item.data;
          const servedCount = renterCounts.get(cleaner.cleaner_id) ?? 0;
          return (
            <article
              key={`platform-${cleaner.cleaner_id}`}
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
                <button
                  type="button"
                  onClick={() => toggleSaved(cleaner.cleaner_id, false)}
                  aria-label={t("addModal.remove")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA]"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
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

              <div className="mt-3 flex items-center gap-1.5">
                <Users
                  className="h-3.5 w-3.5 text-[#64748B]"
                  strokeWidth={2.4}
                />
                <span className="text-[12px] font-semibold text-[#64748B]">
                  {servedCount > 0 ? (
                    <>
                      <span className="font-black text-[#0F172A]">
                        {servedCount}
                      </span>{" "}
                      {t("rentersServed", { count: servedCount })}
                    </>
                  ) : (
                    t("rentersServedNone")
                  )}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <CallButton phone={cleaner.phone} label={tShared("call")} alwaysShowLabel layout="card" className="w-full" />
                <button
                  type="button"
                  onClick={() => openCall(cleaner)}
                  className="rounded-xl bg-[#2563EB] py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF]"
                >
                  {t("callOut")}
                </button>
              </div>
            </article>
          );
        })}

        {listReady && gridCleaners.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-[#E2E8F0] bg-white px-6 py-14 text-center sm:col-span-2 xl:col-span-3">
            <p className="text-sm font-semibold text-[#0F172A]">{t("empty")}</p>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {t("emptyHint")}
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

      <AddCleanerModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        cleaners={uniqueCleaners}
        loading={!listReady}
        savedIds={savedIds}
        onToggle={toggleSaved}
        onCreateOwn={() => {
          setAddModalOpen(false);
          setFormModal({ open: true, cleaner: null });
        }}
      />

      <CleanerFormModal
        isOpen={formModal.open}
        cleaner={formModal.cleaner}
        onClose={() => setFormModal({ open: false, cleaner: null })}
        onSaved={fetchManualCleaners}
      />
    </div>
  );
}
