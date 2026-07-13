"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { Plus, AlertCircle, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActiveOrgScope } from "@/lib/dashboard/orgScope";
import {
  emitSellerLeadsChanged,
  LEAD_STAGE_VALUES,
  leadsClient,
  sellerLeadsScopeKey,
} from "@/lib/supabase/leads";
import { formatNumber } from "@/lib/utils/format";
import { formatRelativeTime } from "@/lib/i18n/relativeTime";
import AddLeadModal, {
  type LeadInput,
  type LeadStage,
  type LeadPriority,
  type LeadInterestType,
  type LeadLocation,
} from "@/components/seller/AddLeadModal";

interface Lead {
  id: string;
  client_name: string;
  client_phone: string | null;
  property_id: string | null;
  property_title?: string | null;
  source: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  note: string | null;
  interest_type: LeadInterestType | null;
  desired_location: LeadLocation | null;
  next_action_at: string | null;
  created_at: string;
}

interface StageStyle {
  dot: string;
  cardBg: string;
  cardBorder: string;
  chip: string;
}

const STAGE_STYLES: Record<LeadStage, StageStyle> = {
  new: {
    dot: "bg-[#2563EB]",
    cardBg: "bg-[#F0F7FF]",
    cardBorder: "border-[#BFDBFE]",
    chip: "bg-[#DCFCE7] text-[#15803D]",
  },
  contacted: {
    dot: "bg-[#F59E0B]",
    cardBg: "bg-[#FFFBEB]",
    cardBorder: "border-[#FCD34D]",
    chip: "bg-[#FEF3C7] text-[#A16207]",
  },
  shown: {
    dot: "bg-[#9333EA]",
    cardBg: "bg-[#FAF5FF]",
    cardBorder: "border-[#E9D5FF]",
    chip: "bg-[#F3E8FF] text-[#9333EA]",
  },
  negotiating: {
    dot: "bg-[#0EA5E9]",
    cardBg: "bg-[#F0FDFA]",
    cardBorder: "border-[#BAE6FD]",
    chip: "bg-[#CFFAFE] text-[#0369A1]",
  },
  closed: {
    dot: "bg-[#10B981]",
    cardBg: "bg-[#F0FDF4]",
    cardBorder: "border-[#A7F3D0]",
    chip: "bg-[#DCFCE7] text-[#15803D]",
  },
};

const STAGES = LEAD_STAGE_VALUES.map((value) => ({
  value,
  ...STAGE_STYLES[value],
}));

const HIGH_PRIORITY_CHIP = "bg-[#DCFCE7] text-[#15803D]";

const SOURCE_KEYS = ["direct", "call", "walk_in", "referral", "other"] as const;

type StageConfig = (typeof STAGES)[number];

function isLeadStage(value: unknown): value is LeadStage {
  return STAGES.some((stage) => stage.value === value);
}

function isMissingLeadsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "42P01" || code === "PGRST205") return true;

  const message = "message" in error ? String(error.message) : "";
  return (
    /relation\s+["']?(?:public\.)?leads["']?\s+does not exist/i.test(message) ||
    /could not find (?:the )?table\s+["']?(?:public\.)?leads/i.test(message)
  );
}

function stageDndId(stage: LeadStage) {
  return `stage:${stage}`;
}

function leadDndId(leadId: string) {
  return `lead:${leadId}`;
}

function stageFromDndData(data: unknown): LeadStage | null {
  if (!data || typeof data !== "object" || !("stage" in data)) return null;
  const stage = (data as { stage?: unknown }).stage;
  return isLeadStage(stage) ? stage : null;
}

function newLeadDelta(previous: LeadStage | null, next: LeadStage) {
  return Number(next === "new") - Number(previous === "new");
}

/** Move keyboard drags one board stage per arrow press. */
const stageKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context },
) => {
  const forward = event.code === "ArrowRight" || event.code === "ArrowDown";
  const backward = event.code === "ArrowLeft" || event.code === "ArrowUp";
  if (!forward && !backward) return undefined;

  const currentStage =
    stageFromDndData(context.over?.data.current) ??
    stageFromDndData(context.active?.data.current);
  if (!currentStage || !context.collisionRect) return undefined;

  const currentIndex = STAGES.findIndex(
    (stage) => stage.value === currentStage,
  );
  const targetStage = STAGES[currentIndex + (forward ? 1 : -1)];
  if (!targetStage) return undefined;

  const targetRect = context.droppableRects.get(stageDndId(targetStage.value));
  if (!targetRect) return undefined;

  event.preventDefault();
  return {
    x:
      targetRect.left +
      Math.max(0, (targetRect.width - context.collisionRect.width) / 2),
    y:
      targetRect.top +
      Math.max(0, (targetRect.height - context.collisionRect.height) / 2),
  };
};

const stageCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return args.pointerCoordinates ? pointerCollisions : closestCenter(args);
};

function StageColumn({
  stage,
  activeStage,
  children,
}: {
  stage: StageConfig;
  activeStage: LeadStage | null;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: stageDndId(stage.value),
    data: { type: "stage", stage: stage.value },
  });
  const isValidTarget =
    isOver && activeStage !== null && activeStage !== stage.value;

  return (
    <div
      ref={setNodeRef}
      data-stage={stage.value}
      data-drop-target={isValidTarget ? "true" : undefined}
      className={`flex min-h-[480px] flex-col rounded-2xl p-3 transition-[background-color,box-shadow] ${
        isValidTarget
          ? "bg-[#EFF6FF] shadow-[inset_0_0_0_2px_#2563EB]"
          : "bg-[#F8FAFC]"
      }`}
    >
      {children}
    </div>
  );
}

function DraggableLeadCard({
  lead,
  disabled,
  ariaLabel,
  className,
  onEdit,
  children,
}: {
  lead: Lead;
  disabled: boolean;
  ariaLabel: string;
  className: string;
  onEdit: (fromPointer: boolean) => void;
  children: ReactNode;
}) {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: leadDndId(lead.id),
    data: {
      type: "lead",
      leadId: lead.id,
      name: lead.client_name,
      stage: lead.stage,
    },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-lead-id={lead.id}
      data-dragging={isDragging ? "true" : undefined}
      aria-label={ariaLabel}
      aria-busy={disabled || undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onEdit(true);
      }}
      onKeyDown={(event) => {
        if (disabled) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          onEdit(false);
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
      className={`${className} min-h-[44px] touch-manipulation rounded-xl border p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[opacity,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 ${
        disabled
          ? "cursor-wait opacity-70"
          : "cursor-grab hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12)] active:cursor-grabbing"
      } ${isDragging ? "opacity-35" : ""}`}
    >
      {children}
    </div>
  );
}

function formatBudget(
  min: number | null,
  max: number | null,
  currency: string,
) {
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₾";
  if (min && max)
    return `${sym}${formatNumber(min)}–${sym}${formatNumber(max)}`;
  if (min) return `${sym}${formatNumber(min)}+`;
  if (max) return `<${sym}${formatNumber(max)}`;
  return null;
}

interface SalesBoardProps {
  heading?: string;
  subtitle?: string;
  showHeading?: boolean;
}

export default function SalesBoard({
  heading,
  subtitle,
  showHeading = true,
}: SalesBoardProps) {
  const t = useTranslations("SellerDashboard.salesBoard");
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();
  const scope = useActiveOrgScope();

  const displayHeading = heading ?? t("title");
  const displaySubtitle = subtitle ?? t("subtitle");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [pendingLeadIds, setPendingLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pointerDragRef = useRef(false);
  const lastPointerDragEndedAtRef = useRef(0);
  const fetchVersionRef = useRef(0);

  const orgScoped = scope.mode === "org" && !!scope.organizationId;
  const persistedScopeKey = useMemo(
    () =>
      user
        ? sellerLeadsScopeKey(
            user.id,
            orgScoped ? scope.organizationId : null,
          )
        : null,
    [orgScoped, scope.organizationId, user],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: stageKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space"],
      },
    }),
  );

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const name = String(active.data.current?.name ?? "");
        const stage = stageFromDndData(active.data.current);
        return t("dragStart", {
          name,
          stage: stage ? t(`stages.${stage}`) : "",
        });
      },
      onDragOver({ active, over }) {
        const stage = stageFromDndData(over?.data.current);
        if (!stage) return undefined;
        return t("dragOver", {
          name: String(active.data.current?.name ?? ""),
          stage: t(`stages.${stage}`),
        });
      },
      onDragEnd({ active, over }) {
        const name = String(active.data.current?.name ?? "");
        const previousStage = stageFromDndData(active.data.current);
        const stage = stageFromDndData(over?.data.current);
        return stage && stage !== previousStage
          ? t("dragEnd", { name, stage: t(`stages.${stage}`) })
          : t("dragCancel", { name });
      },
      onDragCancel({ active }) {
        return t("dragCancel", {
          name: String(active.data.current?.name ?? ""),
        });
      },
    }),
    [t],
  );

  useEffect(() => {
    if (!user) return;
    const requestVersion = ++fetchVersionRef.current;

    async function fetchAll() {
      setLoading(true);
      setTableMissing(false);
      setLoadError(false);
      let query = leadsClient(supabase)
        .from("leads")
        .select("*, property:properties(title)");
      query = orgScoped
        ? query.eq("organization_id", scope.organizationId!)
        : query.eq("owner_id", user!.id);
      const leadsRes = await query.order("created_at", {
        ascending: false,
      });

      if (requestVersion !== fetchVersionRef.current) return;

      if (leadsRes.error) {
        const missingTable = isMissingLeadsTableError(leadsRes.error);
        setTableMissing(missingTable);
        setLoadError(!missingTable);
        setLeads([]);
      } else {
        setTableMissing(false);
        setLoadError(false);
        setLeads(
          (leadsRes.data ?? []).map((r: Record<string, unknown>): Lead => ({
            id: r.id as string,
            client_name: r.client_name as string,
            client_phone: (r.client_phone as string) ?? null,
            property_id: (r.property_id as string) ?? null,
            property_title:
              (r.property as { title?: string } | null)?.title ?? null,
            source: (r.source as string) ?? null,
            stage: r.stage as LeadStage,
            priority: r.priority as LeadPriority,
            budget_min: (r.budget_min as number) ?? null,
            budget_max: (r.budget_max as number) ?? null,
            currency: (r.currency as string) ?? "USD",
            note: (r.note as string) ?? null,
            interest_type: (r.interest_type as LeadInterestType) ?? null,
            desired_location: (r.desired_location as LeadLocation) ?? null,
            next_action_at: (r.next_action_at as string) ?? null,
            created_at: r.created_at as string,
          })),
        );
      }

      setLoading(false);
    }

    fetchAll();
    return () => {
      if (fetchVersionRef.current === requestVersion) {
        fetchVersionRef.current += 1;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scope.mode, scope.organizationId]);

  const byStage = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = {
      new: [],
      contacted: [],
      shown: [],
      negotiating: [],
      closed: [],
    };
    for (const l of leads) map[l.stage].push(l);
    return map;
  }, [leads]);

  const activeLead = activeLeadId
    ? (leads.find((lead) => lead.id === activeLeadId) ?? null)
    : null;

  function notifyPersistedMutation(previous: LeadStage | null, next: LeadStage) {
    if (!persistedScopeKey) return;
    emitSellerLeadsChanged({
      scopeKey: persistedScopeKey,
      newLeadDelta: newLeadDelta(previous, next),
    });
  }

  function openLeadEditor(lead: Lead, fromPointer: boolean) {
    if (
      fromPointer &&
      Date.now() - lastPointerDragEndedAtRef.current < 350
    ) {
      return;
    }
    setEditingLead(lead);
  }

  function finishDrag() {
    if (pointerDragRef.current) {
      lastPointerDragEndedAtRef.current = Date.now();
    }
    pointerDragRef.current = false;
    setActiveLeadId(null);
  }

  function handleDragStart(event: DragStartEvent) {
    const leadId = event.active.data.current?.leadId;
    if (typeof leadId !== "string") return;
    pointerDragRef.current = event.activatorEvent.type !== "keydown";
    setActiveLeadId(leadId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const leadId = event.active.data.current?.leadId;
    const targetStage = stageFromDndData(event.over?.data.current);
    finishDrag();
    if (typeof leadId !== "string" || !targetStage) return;

    const lead = leads.find((item) => item.id === leadId);
    if (
      !lead ||
      lead.stage === targetStage ||
      pendingLeadIds.has(leadId)
    ) {
      return;
    }
    void moveLeadToStage(lead, targetStage);
  }

  function handleDragCancel() {
    finishDrag();
  }

  async function moveLeadToStage(lead: Lead, targetStage: LeadStage) {
    if (!user || lead.stage === targetStage) return;
    const previousStage = lead.stage;
    const updateLocalStage = (stage: LeadStage) => {
      setLeads((current) =>
        current.map((item) =>
          item.id === lead.id ? { ...item, stage } : item,
        ),
      );
      setEditingLead((current) =>
        current?.id === lead.id ? { ...current, stage } : current,
      );
    };

    updateLocalStage(targetStage);
    if (tableMissing) return;

    setPendingLeadIds((current) => {
      const next = new Set(current);
      next.add(lead.id);
      return next;
    });

    try {
      let updateQuery = leadsClient(supabase)
        .from("leads")
        .update({ stage: targetStage })
        .eq("id", lead.id);
      updateQuery = orgScoped
        ? updateQuery.eq("organization_id", scope.organizationId!)
        : updateQuery.eq("owner_id", user.id);
      const { error } = await updateQuery.select("id").single();
      if (error) throw new Error(error.message);

      notifyPersistedMutation(previousStage, targetStage);
      toast.success(t("stageUpdated"));
    } catch {
      updateLocalStage(previousStage);
      toast.error(t("stageUpdateFailed"));
    } finally {
      setPendingLeadIds((current) => {
        const next = new Set(current);
        next.delete(lead.id);
        return next;
      });
    }
  }

  async function handleCreate(input: LeadInput) {
    if (!user) return;
    if (tableMissing) {
      setLeads((prev) => [
        {
          id: `local-${Date.now()}`,
          client_name: input.client_name,
          client_phone: input.client_phone ?? null,
          property_id: null,
          property_title: null,
          source: "direct",
          stage: input.stage,
          priority: input.priority,
          budget_min: input.budget_min ?? null,
          budget_max: input.budget_max ?? null,
          currency: "USD",
          note: input.note ?? null,
          interest_type: input.interest_type ?? null,
          desired_location: input.desired_location ?? null,
          next_action_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }

    const { data, error } = await leadsClient(supabase)
      .from("leads")
      .insert({
        owner_id: user.id,
        ...(orgScoped ? { organization_id: scope.organizationId } : {}),
        client_name: input.client_name,
        client_phone: input.client_phone ?? null,
        stage: input.stage,
        priority: input.priority,
        budget_min: input.budget_min ?? null,
        budget_max: input.budget_max ?? null,
        note: input.note ?? null,
        interest_type: input.interest_type ?? null,
        desired_location: input.desired_location ?? null,
      })
      .select("*, property:properties(title)")
      .single();

    if (error) throw new Error(error.message);
    if (data) {
      setLeads((prev) => [
        {
          id: data.id as string,
          client_name: data.client_name as string,
          client_phone: (data.client_phone as string) ?? null,
          property_id: (data.property_id as string) ?? null,
          property_title:
            (data.property as { title?: string } | null)?.title ?? null,
          source: (data.source as string) ?? null,
          stage: data.stage as LeadStage,
          priority: data.priority as LeadPriority,
          budget_min: (data.budget_min as number) ?? null,
          budget_max: (data.budget_max as number) ?? null,
          currency: (data.currency as string) ?? "USD",
          note: (data.note as string) ?? null,
          interest_type: (data.interest_type as LeadInterestType) ?? null,
          desired_location: (data.desired_location as LeadLocation) ?? null,
          next_action_at: (data.next_action_at as string) ?? null,
          created_at: data.created_at as string,
        },
        ...prev,
      ]);
      notifyPersistedMutation(null, data.stage as LeadStage);
    }
  }

  async function handleUpdate(input: LeadInput) {
    if (!user || !editingLead) return;
    const id = editingLead.id;
    const previousStage = editingLead.stage;

    if (tableMissing) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                client_name: input.client_name,
                client_phone: input.client_phone ?? null,
                stage: input.stage,
                priority: input.priority,
                budget_min: input.budget_min ?? null,
                budget_max: input.budget_max ?? null,
                note: input.note ?? null,
                interest_type: input.interest_type ?? null,
                desired_location: input.desired_location ?? null,
              }
            : l,
        ),
      );
      return;
    }

    let updateQuery = leadsClient(supabase)
      .from("leads")
      .update({
        client_name: input.client_name,
        client_phone: input.client_phone ?? null,
        stage: input.stage,
        priority: input.priority,
        budget_min: input.budget_min ?? null,
        budget_max: input.budget_max ?? null,
        note: input.note ?? null,
        interest_type: input.interest_type ?? null,
        desired_location: input.desired_location ?? null,
      })
      .eq("id", id);
    updateQuery = orgScoped
      ? updateQuery.eq("organization_id", scope.organizationId!)
      : updateQuery.eq("owner_id", user.id);
    const { data, error } = await updateQuery
      .select("*, property:properties(title)")
      .single();

    if (error) throw new Error(error.message);
    if (data) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                client_name: data.client_name as string,
                client_phone: (data.client_phone as string) ?? null,
                property_title:
                  (data.property as { title?: string } | null)?.title ??
                  l.property_title ??
                  null,
                stage: data.stage as LeadStage,
                priority: data.priority as LeadPriority,
                budget_min: (data.budget_min as number) ?? null,
                budget_max: (data.budget_max as number) ?? null,
                currency: (data.currency as string) ?? l.currency,
                note: (data.note as string) ?? null,
                interest_type: (data.interest_type as LeadInterestType) ?? null,
                desired_location:
                  (data.desired_location as LeadLocation) ?? null,
              }
            : l,
        ),
      );
      notifyPersistedMutation(previousStage, data.stage as LeadStage);
    }
  }

  function renderLeadContent(lead: Lead, stage: StageConfig) {
    const budget = formatBudget(
      lead.budget_min,
      lead.budget_max,
      lead.currency,
    );
    const topChipText =
      lead.priority === "high"
        ? t("hotCase")
        : lead.source
          ? SOURCE_KEYS.includes(
              lead.source as (typeof SOURCE_KEYS)[number],
            )
            ? t(
                `sources.${lead.source as (typeof SOURCE_KEYS)[number]}`,
              )
            : lead.source
          : null;

    return (
      <>
        <div className="flex items-center justify-between gap-2">
          {topChipText && (
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                lead.priority === "high" ? HIGH_PRIORITY_CHIP : stage.chip
              }`}
            >
              {topChipText}
            </span>
          )}
          <span className="text-[10px] text-[#94A3B8]">
            {formatRelativeTime(tShared, lead.created_at)}
          </span>
        </div>
        <p className="mt-2 truncate text-[16px] font-extrabold text-[#0F172A]">
          {lead.client_name}
        </p>
        {lead.property_title && (
          <p className="mt-0.5 truncate text-[11px] font-semibold uppercase text-[#64748B]">
            {lead.property_title}
          </p>
        )}
        {budget && (
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white/70 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase text-[#64748B]">
              {t("budget")}
            </span>
            <span className="text-[12px] font-black text-[#0F172A]">
              {budget}
            </span>
          </div>
        )}
        {lead.note && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-white/70 p-2 text-[11px] italic text-[#475569]">
            &ldquo;{lead.note}&rdquo;
          </p>
        )}
        {lead.next_action_at && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-[11px] font-bold text-[#0F172A]">
            <Calendar className="h-3.5 w-3.5" />
            {formatRelativeTime(tShared, lead.next_action_at)}
          </div>
        )}
      </>
    );
  }

  const activeStageConfig = activeLead
    ? (STAGES.find((stage) => stage.value === activeLead.stage) ?? null)
    : null;

  return (
    <div className="space-y-6">
      {showHeading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-[28px] font-black leading-[38px] text-[#0F172A]">
              {displayHeading}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {displaySubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 self-start rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B]"
          >
            <Plus className="h-4 w-4" />
            {t("addLead")}
          </button>
        </motion.div>
      )}

      {tableMissing && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-5 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
          <div className="text-[13px] text-[#78350F]">
            <p className="font-bold">{t("tableMissingTitle")}</p>
            <p className="mt-0.5 text-[12px] text-[#92400E]">
              {t("tableMissingDesc", {
                migration: "supabase/migrations/013_leads.sql",
              })}
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-5 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" />
          <p className="text-[13px] font-bold text-[#991B1B]">
            {t("loadFailed")}
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={stageCollisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("dragInstructions") },
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((stage) => {
            const stageLeads = byStage[stage.value];
            return (
              <StageColumn
                key={stage.value}
                stage={stage}
                activeStage={activeLead?.stage ?? null}
              >
                <div className="mb-3 flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${stage.dot}`}
                      aria-hidden
                    />
                    <span className="text-[12px] font-bold text-[#0F172A]">
                      {t(`stages.${stage.value}`)}
                    </span>
                  </div>
                  <span
                    data-stage-count={stage.value}
                    className="flex h-5 min-w-[20px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-[#64748B]"
                  >
                    {stageLeads.length}
                  </span>
                </div>

                <div className="flex-1 space-y-3">
                  {loading ? (
                    <div className="h-24 animate-pulse rounded-xl bg-white" />
                  ) : stageLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white/50 py-8 text-center text-[11px] text-[#94A3B8]">
                      {tShared("empty")}
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <DraggableLeadCard
                        key={lead.id}
                        lead={lead}
                        disabled={pendingLeadIds.has(lead.id)}
                        ariaLabel={`${tShared("edit")}: ${lead.client_name}`}
                        onEdit={(fromPointer) =>
                          openLeadEditor(lead, fromPointer)
                        }
                        className={`${stage.cardBg} ${stage.cardBorder}`}
                      >
                        {renderLeadContent(lead, stage)}
                      </DraggableLeadCard>
                    ))
                  )}
                </div>
              </StageColumn>
            );
          })}
        </div>

        <DragOverlay modifiers={[restrictToWindowEdges]}>
          {activeLead && activeStageConfig ? (
            <div
              aria-hidden
              className={`w-[280px] max-w-[calc(100vw-2rem)] cursor-grabbing rounded-xl border p-3 text-left opacity-95 shadow-[0_16px_32px_-8px_rgba(15,23,42,0.32)] ${activeStageConfig.cardBg} ${activeStageConfig.cardBorder}`}
            >
              {renderLeadContent(activeLead, activeStageConfig)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddLeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />

      <AddLeadModal
        mode="edit"
        isOpen={editingLead !== null}
        initialLead={editingLead}
        onClose={() => setEditingLead(null)}
        onSubmit={handleUpdate}
      />
    </div>
  );
}
