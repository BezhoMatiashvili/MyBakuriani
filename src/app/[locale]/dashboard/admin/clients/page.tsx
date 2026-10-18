"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Ban,
  Download,
  Gift,
  LogOut,
  Phone,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditTimeline } from "@/components/admin/AuditTimeline";
import { ClientGiftModal } from "@/components/admin/ClientGiftModal";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { ClientFiltersPanel } from "@/components/admin/ClientFiltersPanel";
import {
  MembershipStatePill,
  VipPill,
  useDayFormat,
  useStatusQuery,
} from "@/components/admin/statuses/shared";
import { Link } from "@/i18n/navigation";
import { formatPhone, formatPrice } from "@/lib/utils/format";
import {
  COMPANY_STATES,
  MEMBERSHIP_STATES,
  VIP_TIERS,
} from "@/lib/admin-statuses";
import {
  BALANCE_FILTERS,
  CLIENT_FILTER_KEYS,
  SEEN_FILTERS,
  SIGN_IN_METHODS,
  VERIFIED_FILTERS,
  activeFilterCount,
  matchesClientFilters,
  parseClientFilters,
  type ClientFilterKey,
  type ClientFilterOptions,
} from "@/lib/admin-clients-filter";
import { Constants, type Tables, type Enums } from "@/lib/types/database";

// Facts the filters read, added by GET /api/admin/clients.
type ProfileWithCounts = Tables<"profiles"> & {
  balance_amount: number;
  registered_on: string | null;
  last_sign_in_at: string | null;
  sign_in_methods: string[];
  membership_state: string | null;
  vip_tier: string | null;
  company_state: string | null;
};

const FILTER_OPTIONS: ClientFilterOptions = {
  role: Constants.public.Enums.user_role,
  membership: MEMBERSHIP_STATES,
  vip: ["any", ...VIP_TIERS, "none"],
  company: ["any", ...COMPANY_STATES],
  seen: SEEN_FILTERS,
  method: SIGN_IN_METHODS,
  balance: BALANCE_FILTERS,
  verified: VERIFIED_FILTERS,
};

type Txn = {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
};

const roleBadgeClasses: Record<Enums<"user_role">, string> = {
  guest: "border border-[#E2E8F0] bg-[#ECFDF5] text-[#475569]",
  renter: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  seller: "border border-[#DCFCE7] bg-[#EFF6FF] text-[#2563EB]",
  cleaner: "bg-[#FCE7F3] text-[#BE185D]",
  food: "bg-[#FEE2E2] text-[#B91C1C]",
  entertainment: "bg-[#FEF3C7] text-[#92400E]",
  transport: "bg-[#E0F2FE] text-[#0369A1]",
  employment: "bg-[#F3E8FF] text-[#7E22CE]",
  handyman: "bg-[#CCFBF1] text-[#0F766E]",
  admin: "bg-[#DCFCE7] text-[#166534]",
};

function ClientsPageContent() {
  const t = useTranslations("AdminClients");
  const tShared = useTranslations("AdminShared");
  const tLogs = useTranslations("AdminLogs");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const txDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );
  // Registration and last sign-in as Tbilisi days (bundled date-fns locales:
  // Chrome's Intl has no Georgian month names).
  const formatDay = useDayFormat();
  const query = useStatusQuery();
  const filters = useMemo(
    () => parseClientFilters(query.get, FILTER_OPTIONS),
    [query.get],
  );
  const filterCount = activeFilterCount(filters);
  // One clock for every "last sign-in" window, set when the list loads.
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileWithCounts[]>([]);
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    const digits = q.replace(/\D/g, "");
    return profiles.filter(
      (p) =>
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (digits.length > 0 &&
          (p.phone ?? "").replace(/\D/g, "").includes(digits)) ||
        p.id.toLowerCase().includes(q),
    );
  }, [profiles, search]);
  const filtered = useMemo(
    () => searched.filter((p) => matchesClientFilters(p, filters, now)),
    [searched, filters, now],
  );
  const narrowed = search.trim() !== "" || filterCount > 0;
  const [selectedProfile, setSelectedProfile] =
    useState<ProfileWithCounts | null>(null);
  // null = still loading the selected profile's transactions
  const [txns, setTxns] = useState<Txn[] | null>(null);
  // Lifetime LTV/topup/VIP tiles — computed server-side over the client's
  // FULL transaction history, not the 200-row cap that feeds `txns`.
  const [txStats, setTxStats] = useState<{
    vipCount: number;
    topupCount: number;
    ltv: number;
  } | null>(null);
  const [bonusProfile, setBonusProfile] = useState<ProfileWithCounts | null>(
    null,
  );

  // Profiles + balance arrive pre-joined from one admin RPC instead of
  // downloading profiles and balances separately.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/clients")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { clients?: ProfileWithCounts[] } | null) => {
        if (cancelled) return;
        if (payload?.clients) {
          setNow(Date.now());
          setProfiles(payload.clients);
        } else {
          // Surface failures (e.g. RPC missing) instead of a silently
          // empty directory that looks like data loss.
          toast.error(tShared("loadFailed"));
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(tShared("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real transaction history for the details modal (admin-only API; the
  // browser client can't read other users' transactions through RLS).
  useEffect(() => {
    if (!selectedProfile) return;
    let cancelled = false;
    setTxns(null);
    setTxStats(null);
    fetch(`/api/admin/clients/${selectedProfile.id}/transactions`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          payload: {
            transactions?: Txn[];
            stats?: { vipCount: number; topupCount: number; ltv: number };
          } | null,
        ) => {
          if (cancelled) return;
          setTxns(payload?.transactions ?? []);
          setTxStats(payload?.stats ?? { vipCount: 0, topupCount: 0, ltv: 0 });
        },
      )
      .catch(() => {
        if (cancelled) return;
        setTxns([]);
        setTxStats({ vipCount: 0, topupCount: 0, ltv: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProfile]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <div className="flex items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[32px] font-black leading-[32px] tracking-[-0.8px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm font-medium leading-[21px] text-[#64748B]">
            {t("subtitle")}
          </p>
          <p className="mt-1 text-[13px] font-bold text-[#2563EB]">
            {loading ? "…" : t("totalCount", { count: profiles.length })}
            {!loading && narrowed
              ? ` · ${t("filteredCount", { count: filtered.length })}`
              : null}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-[42px] min-h-11 items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#334155] shadow-sm hover:bg-[#F8FAFC] lg:min-h-0"
        >
          <Download className="h-[13px] w-[13px]" />
          {tShared("export")}
        </button>
      </div>

      <AdminSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("searchPlaceholder")}
      />

      <ClientFiltersPanel
        rows={searched}
        filters={filters}
        options={FILTER_OPTIONS}
        now={now}
        activeCount={filterCount}
        onChange={(key: ClientFilterKey, value) =>
          query.update({ [key]: value })
        }
        onClear={() =>
          query.update(
            Object.fromEntries(CLIENT_FILTER_KEYS.map((key) => [key, null])),
          )
        }
      />

      <section className="overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
          <div className="sticky top-0 z-10 hidden lg:grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-[48px] border-b border-[#E2E8F0] bg-[#F8FAFC] px-6 py-5 text-[12px] font-bold uppercase tracking-[1.2px] text-[#64748B]">
            <span>{t("colClient")}</span>
            <span>{t("colRoleStatus")}</span>
            <span className="text-right">{t("colActions")}</span>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm font-medium text-[#64748B]">
              {t("searchEmpty")}
            </p>
          ) : (
            filtered.map((profile) => (
              <div
                key={profile.id}
                className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1.1fr] lg:gap-[48px] items-center border-b border-[#F1F5F9] px-6 py-[18px] last:border-b-0"
              >
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProfile(profile)}
                      className="text-left text-[16px] font-black leading-[21px] text-[#1E293B] hover:text-[#2563EB]"
                    >
                      {profile.display_name}
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-[#64748B]">
                      <Phone className="h-[14px] w-[14px] shrink-0 text-[#2563EB]" />
                      {formatPhone(profile.phone)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] font-medium leading-[16px] text-[#94A3B8]">
                    {profile.created_at
                      ? `${t("registeredOn", {
                          date: formatDay(profile.created_at),
                        })} · `
                      : null}
                    {profile.last_sign_in_at
                      ? t("lastSignIn", {
                          date: formatDay(profile.last_sign_in_at),
                        })
                      : t("neverSignedIn")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-black leading-[15px] tracking-[0.275px] ${roleBadgeClasses[profile.role]}`}
                    >
                      {tShared(`roles.${profile.role}`)}
                    </span>
                    {profile.membership_state &&
                    profile.membership_state !== "none" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#64748B]">
                        {t("membershipLabel")}
                        <MembershipStatePill state={profile.membership_state} />
                      </span>
                    ) : null}
                    {profile.vip_tier ? (
                      <VipPill tier={profile.vip_tier} />
                    ) : null}
                  </div>
                  <p className="text-[12px] font-semibold leading-[16px] text-[#64748B]">
                    {tShared("balanceLabel", {
                      amount: formatPrice(profile.balance_amount),
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-2 lg:flex-nowrap lg:justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(profile)}
                    className="inline-flex h-8 min-h-11 items-center gap-1.5 rounded-[12px] bg-[#EFF6FF] px-3.5 text-[12px] font-bold text-[#2563EB] hover:bg-[#DBEAFE] lg:min-h-0"
                  >
                    <RefreshCcw className="h-3 w-3" />
                    {t("history")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBonusProfile(profile)}
                    className="inline-flex h-[34px] min-h-11 items-center gap-1.5 rounded-[12px] border border-[#D1FAE5] bg-[#ECFDF5] px-3.5 text-[12px] font-bold text-[#10B981] hover:bg-[#D1FAE5] lg:min-h-0"
                  >
                    <Gift className="h-3 w-3" />
                    {t("bonus")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:bg-white lg:h-9 lg:w-9"
                  >
                    <LogOut className="h-[13px] w-[13px]" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] hover:bg-white lg:h-9 lg:w-9"
                  >
                    <Ban className="h-[13px] w-[13px]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <ClientGiftModal
        client={bonusProfile}
        onClose={() => setBonusProfile(null)}
        onBalanceGifted={(clientId, newBalance) =>
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === clientId ? { ...p, balance_amount: newBalance } : p,
            ),
          )
        }
      />

      {selectedProfile ? (
        <div
          className="fixed bottom-0 right-0 top-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.6)] p-4 backdrop-blur-[2px] lg:left-[281px]"
          onClick={() => setSelectedProfile(null)}
        >
          <div
            className="flex h-auto max-h-full w-full max-w-[700px] flex-col overflow-y-auto rounded-[32px] bg-white shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
              <div className="flex min-h-10 items-center gap-3 pt-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF]">
                  <UserRound className="h-[17px] w-[17px] text-[#2563EB]" />
                </div>
                <h2 className="flex flex-wrap items-center gap-1.5 text-[20px] font-black leading-[30px] text-[#1E293B]">
                  <span>{t("userDetails")}</span>
                  <span className="text-[#2563EB]">
                    {selectedProfile.display_name}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#F1F5F9] bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] lg:h-10 lg:w-10"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="space-y-6 px-8 pb-8 pt-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-[#FFEDD5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#F97316]">
                    {t("vipUsage")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      tShared("timesCount", { count: txStats.vipCount })
                    ) : (
                      <Skeleton className="h-7 w-16" />
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#EEF1F4] bg-[#F8FAFC] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#9333EA]">
                    {t("topups")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      tShared("timesCount", { count: txStats.topupCount })
                    ) : (
                      <Skeleton className="h-7 w-16" />
                    )}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#E2E8E5] bg-[#ECFDF5] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[1.1px] text-[#10B981]">
                    {t("ltv")}
                  </p>
                  <div className="mt-1 text-[28px] font-black leading-7 text-[#1E293B]">
                    {txStats ? (
                      `${txStats.ltv.toFixed(2)} ₾`
                    ) : (
                      <Skeleton className="h-7 w-20" />
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="px-6 py-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[1.3px] text-[#64748B]">
                    {t("txHistory")}
                  </h3>
                </div>
                <div className="max-h-[195px] overflow-x-auto overflow-y-auto">
                  {txns === null ? (
                    <div className="space-y-2 bg-white p-6">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <Skeleton key={idx} className="h-8 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : txns.length === 0 ? (
                    <div className="bg-white px-6 py-10 text-center text-sm font-medium text-[#94A3B8]">
                      {t("txEmpty")}
                    </div>
                  ) : (
                    <table className="w-full min-w-[480px] md:min-w-0">
                      <thead className="bg-[#F8FAFC]">
                        <tr className="border-y border-[#E2E8F0]">
                          <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colDate")}
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colAction")}
                          </th>
                          <th className="px-6 py-3 text-right text-[11px] font-bold uppercase text-[#94A3B8]">
                            {t("colAmount")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {txns.map((tx) => {
                          const amount = Number(tx.amount);
                          const isPositive = amount >= 0;
                          return (
                            <tr
                              key={tx.id}
                              className="border-t border-[#F1F5F9]"
                            >
                              <td className="px-6 py-[17px] text-[13px] font-bold text-[#475569]">
                                {txDateFormatter.format(
                                  new Date(tx.created_at),
                                )}
                              </td>
                              <td className="px-6 py-[17px] text-[13px] font-medium text-[#334155]">
                                {tx.description ?? t(`txTypes.${tx.type}`)}
                              </td>
                              <td
                                className={`px-6 py-[16.5px] text-right text-[14px] font-black ${
                                  isPositive
                                    ? "text-[#10B981]"
                                    : "text-[#EF4444]"
                                }`}
                              >
                                {isPositive ? "+ " : "- "}
                                {Math.abs(amount).toFixed(2)} ₾
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="flex items-center justify-between gap-3 px-6 py-4">
                  <h3 className="text-[13px] font-black uppercase tracking-[1.3px] text-[#64748B]">
                    {tLogs("activityTitle")}
                  </h3>
                  <Link
                    href={`/dashboard/admin/logs?user=${selectedProfile.id}`}
                    className="text-[12px] font-bold text-[#2563EB] hover:underline"
                  >
                    {tLogs("fullHistory")}
                  </Link>
                </div>
                <div className="bg-white px-4 pb-4 pt-3">
                  <AuditTimeline
                    userId={selectedProfile.id}
                    compact
                    pageSize={15}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsPageContent />
    </Suspense>
  );
}
