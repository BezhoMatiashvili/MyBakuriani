"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  Rocket,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { SkierLoader } from "@/components/shared/SkierLoader";
import ConfirmPaymentModal from "@/components/shared/ConfirmPaymentModal";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";

type Org = {
  id: string;
  brand_name: string;
  status: string;
  owner_id: string;
  logo_url: string | null;
};

type Sub = {
  tier: string;
  listing_limit: number | null;
  expires_at: string;
};

type Pkg = {
  code: string;
  name: string;
  label: string | null;
  amount_gel: number;
};

type Agent = {
  id: string;
  role: string;
  status: string;
  user: { display_name: string | null; phone: string | null } | null;
};

export default function OrganizationCabinetPage() {
  const t = useTranslations("Organizations");
  const locale = useLocale();
  const params = useParams();
  const orgId = String(params.id);
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Org | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState({ projects: 0, apartments: 0 });
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const nowIso = new Date().toISOString();

    const [orgRes, subRes, pkgRes, agentRes, propRes, balRes] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("id, brand_name, status, owner_id, logo_url")
          .eq("id", orgId)
          .maybeSingle(),
        supabase
          .from("organization_subscriptions")
          .select("tier, listing_limit, expires_at")
          .eq("organization_id", orgId)
          .eq("status", "active")
          .gt("expires_at", nowIso)
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("pricing_packages")
          .select("code, name, label, amount_gel")
          .eq("category", "subscription")
          .like("code", "company-%")
          .order("sort_order"),
        supabase
          .from("organization_members")
          .select(
            "id, role, status, user:profiles!organization_members_user_id_fkey(display_name, phone)",
          )
          .eq("organization_id", orgId)
          .neq("role", "owner")
          .order("created_at", { ascending: false }),
        supabase
          .from("properties")
          .select("units_total")
          .eq("organization_id", orgId)
          .eq("status", "active"),
        supabase
          .from("balances")
          .select("amount")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    setOrg((orgRes.data as Org) ?? null);
    setSub((subRes.data as Sub) ?? null);
    setSelectedTier((subRes.data as Sub | null)?.tier ?? null);
    setPackages((pkgRes.data as Pkg[]) ?? []);
    setBalance((balRes.data as { amount: number } | null)?.amount ?? null);
    setAgents(
      ((agentRes.data ?? []) as unknown[]).map((a) => {
        const row = a as {
          id: string;
          role: string;
          status: string;
          user: unknown;
        };
        const u = Array.isArray(row.user) ? row.user[0] : row.user;
        return {
          id: row.id,
          role: row.role,
          status: row.status,
          user: (u as Agent["user"]) ?? null,
        };
      }),
    );
    const props = (propRes.data ?? []) as { units_total: number | null }[];
    setStats({
      projects: props.length,
      // A listing without a stated building unit count is at least 1 apartment.
      apartments: props.reduce((sum, p) => sum + (p.units_total ?? 1), 0),
    });
    setLoading(false);
  }, [orgId, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const isOwner = !!org && !!user && org.owner_id === user.id;
  const pendingAgents = agents.filter((a) => a.status === "pending");
  const selectedPkg = packages.find(
    (p) => p.code.replace("company-", "") === selectedTier,
  );
  const daysLeft = sub
    ? Math.max(
        0,
        Math.ceil(
          (new Date(sub.expires_at).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  async function handleActivate() {
    if (!selectedTier || !isOwner) return;
    const supabase = createClient();
    const { error } = await supabase.functions.invoke("company-subscription", {
      body: { org_id: orgId, tier: selectedTier },
    });
    if (error) throw new Error(error.message || t("loadError"));
    toast.success(t("activatedToast"));
    load();
  }

  async function handleAgent(memberId: string, action: "approve" | "reject") {
    setBusyAgent(memberId);
    const supabase = createClient();
    const { error } = await supabase.rpc("respond_membership_request", {
      p_member_id: memberId,
      p_action: action,
    });
    setBusyAgent(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <SkierLoader variant="inline" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-[920px] py-16 text-center">
        <p className="text-[15px] font-bold text-[#64748B]">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[24px] border border-[#E2E8F0] bg-white p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#EFF6FF]">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logo_url}
                alt={org.brand_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-7 w-7 text-[#2563EB]" />
            )}
          </span>
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.5px] text-[#0F172A]">
              {org.brand_name}
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-[13px] font-medium text-[#64748B]">
              {t("adminCabinet")}
              {org.status === "pending" && (
                <span className="rounded-md bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#92400E]">
                  {t("badgePending")}
                </span>
              )}
              {org.status === "active" && (
                <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-bold text-[#166534]">
                  {t("badgeVerified")}
                </span>
              )}
              {org.status === "rejected" && (
                <span className="rounded-md bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
                  {t("badgeRejected")}
                </span>
              )}
            </p>
          </div>
        </div>
        {org.status === "pending" && (
          <div className="flex max-w-[360px] items-start gap-2 rounded-xl bg-[#FFFBEB] p-3 text-[13px] font-medium text-[#92400E]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("verifyWarning")}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t("statProjects")}
          value={`${stats.projects}`}
          unit={t("statProjectsUnit")}
        />
        <StatCard
          label={t("statApartments")}
          value={`${stats.apartments}`}
          unit={t("statApartmentsUnit")}
        />
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
          <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-[#94A3B8]">
            {t("statSubscription")}
          </p>
          {sub ? (
            <div className="mt-2">
              <p className="inline-flex rounded-md bg-[#DCFCE7] px-2.5 py-1 text-[13px] font-bold text-[#166534]">
                {sub.tier.toUpperCase()}
              </p>
              <p
                data-testid="organization-subscription-expiry"
                className="mt-2 text-[12px] font-medium text-[#64748B]"
              >
                {t("expiresAt", {
                  date: formatDateTime(sub.expires_at, locale),
                })}{" "}
                <span className="font-bold text-[#475569]">
                  {t("daysLeft", { count: daysLeft ?? 0 })}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#FEF3C7] px-2.5 py-1 text-[13px] font-bold text-[#92400E]">
              {t("noPackage")} <AlertTriangle className="h-3.5 w-3.5" />
            </p>
          )}
        </div>
      </div>

      {/* Subscription management */}
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-black text-[#0F172A]">
            <Building2 className="h-5 w-5 text-[#2563EB]" />
            {t("subSectionTitle")}
          </h2>
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-bold",
              sub
                ? "bg-[#DCFCE7] text-[#166534]"
                : "bg-[#FEF3C7] text-[#92400E]",
            )}
          >
            {sub ? t("packageActive") : t("packageInactive")}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {packages.map((pkg) => {
            const tier = pkg.code.replace("company-", "");
            const selected = selectedTier === tier;
            const isCurrent = sub?.tier === tier;
            return (
              <button
                key={pkg.code}
                type="button"
                disabled={!isOwner}
                onClick={() => setSelectedTier(tier)}
                className={cn(
                  "rounded-2xl border-2 p-5 text-left transition-all disabled:cursor-not-allowed",
                  selected
                    ? "border-[#2563EB] bg-[#EFF6FF]"
                    : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black uppercase tracking-[0.06em] text-[#64748B]">
                    {pkg.name}
                  </span>
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border-2",
                      selected
                        ? "border-[#2563EB] bg-[#2563EB]"
                        : "border-[#CBD5E1]",
                    )}
                  >
                    {selected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </span>
                </div>
                <p className="mt-3 text-[17px] font-black text-[#0F172A]">
                  {pkg.label}
                </p>
                <p className="mt-3 text-[15px] font-bold text-[#0F172A]">
                  {pkg.amount_gel} ₾{" "}
                  <span className="text-[12px] font-medium text-[#94A3B8]">
                    {t("perMonth")}
                  </span>
                </p>
                {isCurrent && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-[#16A34A]">
                    <Check className="h-3.5 w-3.5" /> {t("packageActive")}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {isOwner && (
          <div className="mt-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-[13px] font-medium text-[#64748B]">
              {t("activateHint")}
            </p>
            <button
              type="button"
              disabled={!selectedTier}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 text-[14px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("activate")} <Rocket className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Agents management */}
      <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[16px] font-black text-[#0F172A]">
            <Users className="h-5 w-5 text-[#16A34A]" />
            {t("agentsTitle")}
          </h2>
          {pendingAgents.length > 0 && (
            <span className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-bold text-white">
              {t("agentsNewBadge", { count: pendingAgents.length })}
            </span>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {agents.length === 0 && (
            <p className="py-4 text-center text-sm font-medium text-[#94A3B8]">
              {t("noAgents")}
            </p>
          )}
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-[13px] font-bold text-[#475569]">
                {(agent.user?.display_name ?? "?").slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#0F172A]">
                  {agent.user?.display_name ?? "—"}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                  {agent.status === "pending"
                    ? t("agentRequestLabel")
                    : agent.status === "approved"
                      ? t("roleAgent")
                      : t("statusRejected")}
                  {agent.user?.phone ? ` • ${agent.user.phone}` : ""}
                </p>
              </div>
              {isOwner && agent.status === "pending" && (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAgent === agent.id}
                    onClick={() => handleAgent(agent.id, "reject")}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[#FECACA] bg-white px-3 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2] disabled:opacity-60 lg:h-[38px]"
                  >
                    <X className="h-4 w-4" />
                    {t("reject")}
                  </button>
                  <button
                    type="button"
                    disabled={busyAgent === agent.id}
                    onClick={() => handleAgent(agent.id, "approve")}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#2563EB] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60 lg:h-[38px]"
                  >
                    {busyAgent === agent.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {t("approve")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmPaymentModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleActivate}
        title={selectedPkg?.name ?? ""}
        description={selectedPkg?.label ?? ""}
        priceLabel={
          selectedPkg ? `${selectedPkg.amount_gel} ₾ ${t("perMonth")}` : ""
        }
        balance={balance ?? undefined}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-2 text-[24px] font-black text-[#0F172A]">
        {value}{" "}
        <span className="text-[13px] font-medium text-[#94A3B8]">{unit}</span>
      </p>
    </div>
  );
}
