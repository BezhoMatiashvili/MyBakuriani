"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Calendar,
  RotateCcw,
  UserPlus,
  Pencil,
  Trash2,
  X,
  Users,
  Eye,
  MapPin,
  AlertCircle,
  RefreshCw,
  Home,
  FileText,
  Ban,
  Phone,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import CleanerCallModal from "@/components/renter/CleanerCallModal";
import AddCleanerModal from "@/components/renter/AddCleanerModal";
import CleanerDetailModal, {
  type CleanerProfileView,
  type CleanerServiceProfile,
  type ManualCleanerProfile,
  type PlatformCleanerProfile,
} from "@/components/renter/CleanerDetailModal";
import CleanerFormModal from "@/components/renter/CleanerFormModal";
import { CallButton } from "@/components/shared/CallButton";
import { formatDateTime, formatPhone, formatPrice } from "@/lib/utils/format";
import {
  optionKeyFor,
  priceUnitPathFor,
} from "@/lib/constants/listing-options";
import type { Database, Tables } from "@/lib/types/database";
import {
  loadCleaningTaskCleanerDetails,
  transitionPlatformCleanerTask,
  type CleaningTaskCleanerDetails,
} from "@/lib/cleaner/tasks";
import { normalizeE164Phone } from "@/lib/security";

type PlatformCleaner =
  Database["public"]["Functions"]["get_platform_cleaners"]["Returns"][number];

type ManualCleaner = Tables<"renter_cleaners">;

interface PublicServiceDetail {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  price_unit: string | null;
  photos: string[] | null;
  location: string | null;
  schedule: string | null;
  operating_hours: string | null;
  experience_required: string | null;
  languages: string[] | null;
  service_field: string | null;
  profile_avatar_url: string | null;
  profile_is_verified: boolean | null;
}

// The grid mixes saved platform cleaners and the renter's own manual entries.
type GridCleaner =
  | { kind: "platform"; data: PlatformCleanerProfile }
  | { kind: "manual"; data: ManualCleaner };

type MyTask = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title"> | null;
};

type CallTarget = {
  cleaner: {
    cleanerId: string;
    serviceId: string;
    serviceTitle: string;
    name: string;
    price: number | null;
    priceUnit: string | null;
  };
  prefill?: {
    propertyId?: string;
    cleaningType?: string;
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
  cancellation_requested: "bg-[#FEF3C7] text-[#B45309]",
  cancelled: "bg-[#F1F5F9] text-[#64748B]",
};

function deriveInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join(".");
}

function toManualProfile(cleaner: ManualCleaner): ManualCleanerProfile {
  return {
    kind: "manual",
    id: cleaner.id,
    name: cleaner.name,
    phone: cleaner.phone,
    available: cleaner.available,
    location: cleaner.location,
    description: cleaner.description,
    experienceYears: cleaner.experience_years,
    languages: cleaner.languages,
    schedule: cleaner.schedule,
    priceStandard: cleaner.price_standard,
    priceGeneral: cleaner.price_general,
  };
}

export default function RenterCleanersPage() {
  const t = useTranslations("RenterCleaners");
  const tShared = useTranslations("DashboardShared");
  const tOpts = useTranslations("ListingOptions");
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [cleaners, setCleaners] = useState<PlatformCleaner[]>([]);
  const [serviceDetails, setServiceDetails] = useState<PublicServiceDetail[]>(
    [],
  );
  const [cleanersLoaded, setCleanersLoaded] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
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
  const [detailModal, setDetailModal] = useState<{
    profile: CleanerProfileView;
    mode: "add" | "saved";
    returnToAdd: boolean;
  } | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailSaveError, setDetailSaveError] = useState(false);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [taskCleanerDetails, setTaskCleanerDetails] = useState<
    Map<string, CleaningTaskCleanerDetails>
  >(new Map());
  const callsSectionRef = useRef<HTMLDivElement>(null);

  const fetchCleaners = useCallback(async () => {
    setCleanersLoaded(false);
    setDetailsLoaded(false);
    setDetailsError(false);
    const { data, error } = await supabase.rpc("get_platform_cleaners");
    if (error || !data) {
      setCleaners([]);
      setServiceDetails([]);
      setDetailsError(true);
      setCleanersLoaded(true);
      setDetailsLoaded(true);
      return;
    }

    const directory = data as PlatformCleaner[];
    setCleaners(directory);
    setCleanersLoaded(true);
    const serviceIds = Array.from(
      new Set(directory.map((cleaner) => cleaner.service_id)),
    );
    if (serviceIds.length === 0) {
      setServiceDetails([]);
      setDetailsLoaded(true);
      return;
    }

    // public_services is the explicit safe read model: it contains profile and
    // capability data, but never raw phone/WhatsApp or private cleaner fields.
    // The generated view type intentionally mirrors the legacy base-table shape,
    // so the appended profile_* columns need this narrow runtime cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detailsResult = await (supabase as any)
      .from("public_services")
      .select(
        "id, title, description, price, price_unit, photos, location, schedule, operating_hours, experience_required, languages, service_field, profile_avatar_url, profile_is_verified",
      )
      .in("id", serviceIds);
    if (detailsResult.error) {
      setServiceDetails([]);
      setDetailsError(true);
    } else {
      setServiceDetails(
        (detailsResult.data ?? []) as PublicServiceDetail[],
      );
    }
    setDetailsLoaded(true);
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
    const [tasksResult, detailsResult] = await Promise.all([
      supabase
        .from("cleaning_tasks")
        .select("*, properties(title)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      loadCleaningTaskCleanerDetails(supabase),
    ]);
    if (tasksResult.data) setTasks(tasksResult.data as MyTask[]);
    if (detailsResult.data) {
      setTaskCleanerDetails(
        new Map(detailsResult.data.map((detail) => [detail.task_id, detail])),
      );
    } else {
      // Never retain contact details from a previous successful fetch. The task
      // may have moved into a state where the renter should no longer see them.
      setTaskCleanerDetails(new Map());
    }
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

  function openCall(
    cleaner: PlatformCleanerProfile,
    service: CleanerServiceProfile,
  ) {
    setCallModal({
      cleaner: {
        cleanerId: cleaner.id,
        serviceId: service.id,
        serviceTitle: service.title,
        name: cleaner.name,
        price: service.price,
        priceUnit: service.priceUnit,
      },
    });
  }

  function redial(task: MyTask) {
    if (!task.cleaner_id) return;
    const profile = platformProfiles.find(
      (cleaner) => cleaner.id === task.cleaner_id,
    );
    const service =
      profile?.services.find(
        (candidate) => candidate.id === task.cleaner_service_id,
      ) ?? profile?.services[0];
    const name = profile?.name ?? t("defaultCleaner");
    setCallModal({
      cleaner: {
        cleanerId: task.cleaner_id,
        serviceId: service?.id ?? "",
        serviceTitle:
          service?.title ?? task.service_title ?? t("serviceFallback"),
        name,
        price: service?.price ?? task.price,
        priceUnit: service?.priceUnit ?? task.price_unit,
      },
      prefill: {
        propertyId: task.property_id,
        cleaningType: task.cleaning_type,
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

  async function cancelTask(task: MyTask) {
    if (task.status !== "pending" && task.status !== "accepted") return;
    const needsConsent = task.status === "accepted";
    if (
      !window.confirm(
        needsConsent ? t("cancelAcceptedConfirm") : t("cancelPendingConfirm"),
      )
    ) {
      return;
    }

    setTaskActionId(task.id);
    const { error } = await transitionPlatformCleanerTask(
      supabase,
      task.id,
      needsConsent ? "cancellation_requested" : "cancelled",
    );
    setTaskActionId(null);
    if (error) {
      toast.error(t("cancelError"));
      return;
    }
    toast.success(
      needsConsent ? t("cancellationRequestedSuccess") : t("cancelledSuccess"),
    );
    await fetchTasks();
  }

  function handleCallSent() {
    toast.success(t("callSentSuccess"));
    void fetchTasks().finally(() => {
      window.setTimeout(
        () =>
          callsSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
    });
  }

  const visibleTasks = tasks;

  const platformProfiles = useMemo<PlatformCleanerProfile[]>(() => {
    const detailsById = new Map(
      serviceDetails.map((service) => [service.id, service]),
    );
    const profiles = new Map<string, PlatformCleanerProfile>();

    for (const cleaner of cleaners) {
      const detail = detailsById.get(cleaner.service_id);
      const service: CleanerServiceProfile = {
        id: cleaner.service_id,
        title: detail?.title ?? t("serviceFallback"),
        description: detail?.description ?? null,
        location: detail?.location ?? cleaner.location ?? null,
        languages: detail?.languages ?? null,
        schedule: detail?.schedule ?? detail?.operating_hours ?? null,
        experience: detail?.experience_required ?? null,
        serviceField: detail?.service_field ?? null,
        price: detail?.price ?? cleaner.price ?? null,
        priceUnit: detail?.price_unit ?? cleaner.price_unit ?? null,
        photoUrl: detail?.photos?.[0] ?? cleaner.photo ?? null,
      };
      const current = profiles.get(cleaner.cleaner_id);
      if (current) {
        if (!current.services.some((item) => item.id === service.id)) {
          current.services.push(service);
        }
        current.isOnline ||= cleaner.is_online;
        current.isVerified ||= Boolean(detail?.profile_is_verified);
        current.avatarUrl ??=
          cleaner.avatar_url ?? detail?.profile_avatar_url ?? null;
      } else {
        profiles.set(cleaner.cleaner_id, {
          kind: "platform",
          id: cleaner.cleaner_id,
          name: cleaner.name,
          avatarUrl:
            cleaner.avatar_url ?? detail?.profile_avatar_url ?? null,
          isOnline: cleaner.is_online,
          isVerified: Boolean(detail?.profile_is_verified),
          rentersServed: renterCounts.get(cleaner.cleaner_id) ?? 0,
          services: [service],
        });
      }
    }

    return Array.from(profiles.values())
      .map((profile) => ({
        ...profile,
        services: [...profile.services].sort(
          (a, b) =>
            a.title.localeCompare(b.title, "ka") || a.id.localeCompare(b.id),
        ),
      }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "ka") || a.id.localeCompare(b.id),
      );
  }, [cleaners, renterCounts, serviceDetails, t]);

  const myCleaners = platformProfiles.filter((cleaner) =>
    savedIds.has(cleaner.id),
  );
  // Unified grid: saved platform cleaners + the renter's own manual entries.
  const gridCleaners: GridCleaner[] = [
    ...myCleaners.map((c) => ({ kind: "platform" as const, data: c })),
    ...manualCleaners.map((c) => ({ kind: "manual" as const, data: c })),
  ];
  const listReady =
    cleanersLoaded && detailsLoaded && savedLoaded && manualLoaded;

  function openDetails(
    profile: CleanerProfileView,
    mode: "add" | "saved",
    returnToAdd = false,
  ) {
    if (returnToAdd) setAddModalOpen(false);
    setDetailSaveError(false);
    setDetailModal({ profile, mode, returnToAdd });
  }

  function closeDetails() {
    if (detailModal?.returnToAdd) setAddModalOpen(true);
    setDetailModal(null);
  }

  async function toggleFromDetails(profile: PlatformCleanerProfile) {
    setDetailSaving(true);
    setDetailSaveError(false);
    try {
      const saved = await toggleSaved(
        profile.id,
        !savedIds.has(profile.id),
      );
      setDetailSaveError(!saved);
    } finally {
      setDetailSaving(false);
    }
  }

  function editManualFromDetails(profile: ManualCleanerProfile) {
    const cleaner = manualCleaners.find((item) => item.id === profile.id) ?? null;
    setDetailModal(null);
    setFormModal({ open: true, cleaner });
  }

  function callOutFromDetails(
    profile: PlatformCleanerProfile,
    service: CleanerServiceProfile,
  ) {
    setDetailModal(null);
    openCall(profile, service);
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              callsSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Calendar className="h-4 w-4" strokeWidth={2.4} />
            {t("myCalls")}
            {tasksLoaded && tasks.length > 0 && (
              <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] text-[#2563EB]">
                {tasks.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0F172A] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.4} />
            {tShared("add")}
          </button>
        </div>
      </motion.div>

      {detailsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4"
        >
          <AlertCircle className="size-4 shrink-0 text-[#DC2626]" />
          <p className="min-w-0 flex-1 text-[12px] font-bold text-[#991B1B]">
            {t("detailsLoadError")}
          </p>
          <button
            type="button"
            onClick={() => void fetchCleaners()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-[12px] font-bold text-[#0F172A]"
          >
            <RefreshCw className="size-3.5" />
            {t("retry")}
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {gridCleaners.map((item) => {
          if (item.kind === "manual") {
            const c = item.data;
            const profile = toManualProfile(c);
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
                    <p className="mt-0.5 text-[11px] font-bold text-[#4F46E5]">
                      {t("sourceManual")}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-lg bg-[#EEF2FF] px-3 py-1.5 text-[11px] font-bold text-[#4F46E5]">
                    {c.available ? t("available") : t("unavailable")}
                  </span>
                </div>

                {c.location && (
                  <p className="mt-3 flex items-start gap-1.5 text-[12px] font-semibold leading-5 text-[#64748B]">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    {c.location}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 min-h-10 text-[12px] font-medium leading-5 text-[#475569]">
                  {c.description ?? t("manualIncomplete")}
                </p>

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

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openDetails(profile, "saved")}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Eye className="size-4" />
                    {t("details")}
                  </button>
                  <CallButton
                    phone={c.phone}
                    label={tShared("call")}
                    alwaysShowLabel
                    layout="card"
                    className="flex-1"
                  />
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
          const primaryService = cleaner.services[0];
          const photo = cleaner.avatarUrl ?? primaryService?.photoUrl;
          const locations = Array.from(
            new Set(
              cleaner.services.flatMap((service) =>
                (service.location ?? "")
                  .split(",")
                  .map((zone) => zone.trim())
                  .filter(Boolean),
              ),
            ),
          );
          const prices = cleaner.services
            .map((service) => service.price)
            .filter((price): price is number => price != null);
          const minPrice = prices.length ? Math.min(...prices) : null;
          return (
            <article
              key={`platform-${cleaner.id}`}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3">
                {photo ? (
                  <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-full">
                    <Image
                      src={photo}
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
                  <p className="mt-0.5 text-[11px] font-bold text-[#2563EB]">
                    {t("sourcePlatform")}
                  </p>
                </div>
                {cleaner.isOnline && (
                  <span className="inline-flex items-center rounded-lg bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-bold text-[#16A34A]">
                    {t("available")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleSaved(cleaner.id, false)}
                  aria-label={t("addModal.remove")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA] lg:h-9 lg:w-9"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>

              {locations.length > 0 && (
                <p className="mt-3 flex items-start gap-1.5 text-[12px] font-semibold leading-5 text-[#64748B]">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-1">{locations.join(", ")}</span>
                </p>
              )}

              <p className="mt-2 line-clamp-2 min-h-10 text-[12px] font-semibold leading-5 text-[#334155]">
                {cleaner.services
                  .slice(0, 2)
                  .map((service) => service.title)
                  .join(" · ")}
                {cleaner.services.length > 2 &&
                  ` · ${t("moreServices", { count: cleaner.services.length - 2 })}`}
              </p>

              {minPrice != null && (
                <p className="mt-3 text-[14px] font-black text-[#0F172A]">
                  {t("priceFrom", { price: formatPrice(minPrice) })}
                  {primaryService?.priceUnit && (
                    <span className="text-[12px] font-semibold text-[#64748B]">
                      {" "}
                      / {priceUnitLabel(primaryService.priceUnit)}
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
                  {cleaner.rentersServed > 0 ? (
                    <>
                      <span className="font-black text-[#0F172A]">
                        {cleaner.rentersServed}
                      </span>{" "}
                      {t("rentersServed", { count: cleaner.rentersServed })}
                    </>
                  ) : (
                    t("rentersServedNone")
                  )}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openDetails(cleaner, "saved")}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[12px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <Eye className="size-4" />
                  {t("details")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    cleaner.services.length === 1
                      ? openCall(cleaner, cleaner.services[0])
                      : openDetails(cleaner, "saved")
                  }
                  className="min-h-11 rounded-xl bg-[#2563EB] px-3 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF]"
                >
                  {cleaner.services.length === 1
                    ? t("callOut")
                    : t("chooseService")}
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
        ref={callsSectionRef}
        id="my-cleaner-calls"
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
          const detail = taskCleanerDetails.get(task.id);
          const currentProfile = task.cleaner_id
            ? platformProfiles.find((profile) => profile.id === task.cleaner_id)
            : null;
          const cleanerName =
            detail?.cleaner_name ??
            currentProfile?.name ??
            t("defaultCleaner");
          const cleanerAvatar =
            detail?.cleaner_avatar_url ?? currentProfile?.avatarUrl ?? null;
          const contactMayBeVisible = [
            "accepted",
            "cancellation_requested",
            "in_progress",
            "completed",
          ].includes(task.status ?? "");
          const phone = contactMayBeVisible
            ? normalizeE164Phone(detail?.phone)
            : null;
          const whatsapp = contactMayBeVisible
            ? normalizeE164Phone(detail?.whatsapp)
            : null;
          const canCancel =
            task.status === "pending" || task.status === "accepted";
          const canRedial =
            (task.status === "declined" || task.status === "cancelled") &&
            Boolean(currentProfile?.services[0]);
          return (
            <article
              key={task.id}
              data-testid={`renter-cleaning-task-${task.id}`}
              className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {cleanerAvatar ? (
                    <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-full">
                      <Image
                        src={cleanerAvatar}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-extrabold text-[#2563EB]">
                      {deriveInitials(cleanerName)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                      {t("cleanerLabel")}
                    </p>
                    <p className="mt-1 truncate text-[17px] font-black text-[#0F172A]">
                      {cleanerName}
                    </p>
                  </div>
                </div>
                {badgeClass && (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-[11px] font-bold ${badgeClass}`}
                  >
                    {t(`status.${task.status}`)}
                  </span>
                )}
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-3 rounded-2xl bg-[#F8FAFC] p-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("propertyLabel")}
                  </dt>
                  <dd className="mt-1 flex items-start gap-1.5 text-[13px] font-bold text-[#0F172A]">
                    <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                    {task.properties?.title ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("dateTimeLabel")}
                  </dt>
                  <dd className="mt-1 flex items-start gap-1.5 text-[13px] font-bold text-[#0F172A]">
                    <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                    {formatDateTime(task.scheduled_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("typeLabel")}
                  </dt>
                  <dd className="mt-1 text-[13px] font-bold text-[#0F172A]">
                    {cleaningKey
                      ? tOpts(`cleaningTypes.${cleaningKey}`)
                      : task.cleaning_type}
                  </dd>
                </div>
                {task.service_title && (
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                      {t("serviceLabel")}
                    </dt>
                    <dd className="mt-1 text-[13px] font-bold text-[#0F172A]">
                      {task.service_title}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("priceLabel")}
                  </dt>
                  <dd className="mt-1 text-[13px] font-black text-[#0F172A]">
                    {task.price != null
                      ? formatPrice(Number(task.price))
                      : t("priceOnAgreement")}
                    {task.price_unit && (
                      <span className="text-[11px] font-semibold text-[#64748B]">
                        {" / "}
                        {priceUnitLabel(task.price_unit)}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {t("addressLabel")}
                  </dt>
                  <dd className="mt-1 flex items-start gap-1.5 text-[13px] font-medium text-[#475569]">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {task.address ?? "—"}
                  </dd>
                </div>
                {task.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                      {t("notesLabel")}
                    </dt>
                    <dd className="mt-1 flex items-start gap-1.5 whitespace-pre-wrap text-[13px] font-medium leading-5 text-[#475569]">
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {task.notes}
                    </dd>
                  </div>
                )}
              </dl>

              {task.status === "cancellation_requested" && (
                <p className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[12px] font-bold leading-5 text-[#92400E]">
                  {t("cancellationWaitingHelp")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0EA5E9] px-4 text-[12px] font-bold text-white"
                  >
                    <Phone className="size-4" />
                    {formatPhone(phone)}
                  </a>
                )}
                {whatsapp && (
                  <a
                    href={`https://wa.me/${whatsapp.slice(1)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#16A34A] px-4 text-[12px] font-bold text-white"
                  >
                    <MessageCircle className="size-4" />
                    {t("whatsapp")}
                  </a>
                )}
                {contactMayBeVisible && !phone && !whatsapp && (
                  <span className="text-[11px] font-semibold text-[#94A3B8]">
                    {t("contactUnavailable")}
                  </span>
                )}
                {task.status === "pending" && (
                  <span className="text-[11px] font-semibold text-[#94A3B8]">
                    {t("contactAfterAcceptance")}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF1F4] pt-4">
                {canRedial && (
                  <button
                    type="button"
                    onClick={() => redial(task)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
                    {t("redial")}
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => void cancelTask(task)}
                    disabled={taskActionId === task.id}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FEF2F2] px-4 py-2.5 text-[13px] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" strokeWidth={2.4} />
                    {task.status === "pending"
                      ? t("cancelCall")
                      : t("requestCancellation")}
                  </button>
                )}
              </div>
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
        onSent={handleCallSent}
      />

      <AddCleanerModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        cleaners={platformProfiles}
        loading={!cleanersLoaded || !detailsLoaded || !savedLoaded}
        detailsError={detailsError}
        savedIds={savedIds}
        onToggle={toggleSaved}
        onRetry={fetchCleaners}
        onViewDetails={(profile) =>
          openDetails(profile, "add", true)
        }
        onCreateOwn={() => {
          setAddModalOpen(false);
          setFormModal({ open: true, cleaner: null });
        }}
      />

      <CleanerDetailModal
        isOpen={detailModal !== null}
        profile={detailModal?.profile ?? null}
        mode={detailModal?.mode}
        saved={
          detailModal?.profile.kind === "platform"
            ? savedIds.has(detailModal.profile.id)
            : true
        }
        saving={detailSaving}
        saveError={detailSaveError}
        onClose={closeDetails}
        onToggleSaved={toggleFromDetails}
        onCallOut={callOutFromDetails}
        onEditManual={editManualFromDetails}
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
