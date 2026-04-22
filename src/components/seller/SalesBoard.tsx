"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { leadsClient } from "@/lib/supabase/leads";
import AddLeadModal, {
  type LeadInput,
  type LeadStage,
  type LeadPriority,
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
  next_action_at: string | null;
  created_at: string;
}

const STAGES: {
  value: LeadStage;
  label: string;
  dot: string;
  cardBg: string;
  cardBorder: string;
  chip: string;
}[] = [
  {
    value: "new",
    label: "ახალი მოთხოვნა",
    dot: "bg-[#2563EB]",
    cardBg: "bg-[#F0F7FF]",
    cardBorder: "border-[#BFDBFE]",
    chip: "bg-[#DCFCE7] text-[#15803D]",
  },
  {
    value: "contacted",
    label: "დავუკავშირდი",
    dot: "bg-[#F59E0B]",
    cardBg: "bg-[#FFFBEB]",
    cardBorder: "border-[#FCD34D]",
    chip: "bg-[#FEF3C7] text-[#A16207]",
  },
  {
    value: "shown",
    label: "ვაჩვენე ობიექტი",
    dot: "bg-[#9333EA]",
    cardBg: "bg-[#FAF5FF]",
    cardBorder: "border-[#E9D5FF]",
    chip: "bg-[#F3E8FF] text-[#9333EA]",
  },
  {
    value: "negotiating",
    label: "მოლაპარაკება",
    dot: "bg-[#0EA5E9]",
    cardBg: "bg-[#F0FDFA]",
    cardBorder: "border-[#BAE6FD]",
    chip: "bg-[#CFFAFE] text-[#0369A1]",
  },
  {
    value: "closed",
    label: "გაფორმდა",
    dot: "bg-[#10B981]",
    cardBg: "bg-[#F0FDF4]",
    cardBorder: "border-[#A7F3D0]",
    chip: "bg-[#DCFCE7] text-[#15803D]",
  },
];

const HIGH_PRIORITY_CHIP = "bg-[#DCFCE7] text-[#15803D]";

const SOURCE_LABEL: Record<string, string> = {
  smart_match: "ჭკვიანი ძიება",
  direct: "პირდაპირი",
  call: "ზარი",
  walk_in: "ვიზიტი",
  referral: "რეკომენდაცია",
  other: "სხვა",
};

function relativeTimeKa(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ახლა";
  if (mins < 60) return `${mins} წთ წინ`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} სთ წინ`;
  const days = Math.floor(hours / 24);
  return `${days} დღის წინ`;
}

function formatBudget(
  min: number | null,
  max: number | null,
  currency: string,
) {
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₾";
  if (min && max)
    return `${sym}${min.toLocaleString()}–${sym}${max.toLocaleString()}`;
  if (min) return `${sym}${min.toLocaleString()}+`;
  if (max) return `<${sym}${max.toLocaleString()}`;
  return null;
}

interface SalesBoardProps {
  heading?: string;
  subtitle?: string;
  showHeading?: boolean;
}

export default function SalesBoard({
  heading = "გაყიდვების დაფა",
  subtitle = "მართეთ მოთხოვნები ეტაპების მიხედვით (გადატრევის პრინციპით).",
  showHeading = true,
}: SalesBoardProps) {
  const { user } = useAuth();
  const supabase = createClient();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function fetchAll() {
      setLoading(true);
      const [leadsRes, propsRes] = await Promise.all([
        leadsClient(supabase)
          .from("leads")
          .select("*, property:properties(title)")
          .eq("owner_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("properties")
          .select("id, title")
          .eq("owner_id", user!.id)
          .eq("is_for_sale", true),
      ]);

      if (leadsRes.error) {
        setTableMissing(true);
        setLeads([]);
      } else {
        setTableMissing(false);
        setLeads(
          (leadsRes.data ?? []).map(
            (r: Record<string, unknown>): Lead => ({
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
              next_action_at: (r.next_action_at as string) ?? null,
              created_at: r.created_at as string,
            }),
          ),
        );
      }

      if (propsRes.data) setProperties(propsRes.data);
      setLoading(false);
    }

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  async function handleCreate(input: LeadInput) {
    if (!user) return;
    if (tableMissing) {
      setLeads((prev) => [
        {
          id: `local-${Date.now()}`,
          client_name: input.client_name,
          client_phone: input.client_phone ?? null,
          property_id: input.property_id ?? null,
          property_title:
            properties.find((p) => p.id === input.property_id)?.title ?? null,
          source: "direct",
          stage: input.stage,
          priority: input.priority,
          budget_min: input.budget_min ?? null,
          budget_max: input.budget_max ?? null,
          currency: "USD",
          note: null,
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
        client_name: input.client_name,
        client_phone: input.client_phone ?? null,
        property_id: input.property_id ?? null,
        stage: input.stage,
        priority: input.priority,
        budget_min: input.budget_min ?? null,
        budget_max: input.budget_max ?? null,
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
          next_action_at: (data.next_action_at as string) ?? null,
          created_at: data.created_at as string,
        },
        ...prev,
      ]);
    }
  }

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
              {heading}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 self-start rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B]"
          >
            <Plus className="h-4 w-4" />
            მოთხოვნის დამატება
          </button>
        </motion.div>
      )}

      {tableMissing && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-5 py-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
          <div className="text-[13px] text-[#78350F]">
            <p className="font-bold">Leads ცხრილი არ არსებობს ბაზაში.</p>
            <p className="mt-0.5 text-[12px] text-[#92400E]">
              მოთხოვნები დროებით ინახება ბრაუზერში. გასაშვებად გაუშვით მიგრაცია{" "}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
                supabase/migrations/013_leads.sql
              </code>
              .
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const stageLeads = byStage[stage.value];
          return (
            <div
              key={stage.value}
              className="flex min-h-[480px] flex-col rounded-2xl bg-[#F8FAFC] p-3"
            >
              <div className="mb-3 flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${stage.dot}`}
                    aria-hidden
                  />
                  <span className="text-[12px] font-bold text-[#0F172A]">
                    {stage.label}
                  </span>
                </div>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-[#64748B]">
                  {stageLeads.length}
                </span>
              </div>

              <div className="flex-1 space-y-3">
                {loading ? (
                  <div className="h-24 animate-pulse rounded-xl bg-white" />
                ) : stageLeads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white/50 py-8 text-center text-[11px] text-[#94A3B8]">
                    ცარიელია
                  </div>
                ) : (
                  stageLeads.map((lead) => {
                    const budget = formatBudget(
                      lead.budget_min,
                      lead.budget_max,
                      lead.currency,
                    );
                    const topChipText =
                      lead.priority === "high"
                        ? "ცხელი ქეისი"
                        : lead.source
                          ? (SOURCE_LABEL[lead.source] ?? lead.source)
                          : null;
                    return (
                      <div
                        key={lead.id}
                        className={`rounded-xl border p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${stage.cardBg} ${stage.cardBorder}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {topChipText && (
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                lead.priority === "high"
                                  ? HIGH_PRIORITY_CHIP
                                  : stage.chip
                              }`}
                            >
                              {topChipText}
                            </span>
                          )}
                          <span className="text-[10px] text-[#94A3B8]">
                            {relativeTimeKa(lead.created_at)}
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
                              ბიუჯეტი
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
                            <span aria-hidden>📅</span>
                            {relativeTimeKa(lead.next_action_at)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AddLeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        properties={properties}
      />
    </div>
  );
}
