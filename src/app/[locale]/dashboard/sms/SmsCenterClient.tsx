"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  BadgeCheck,
  Bell,
  Clock,
  Heart,
  MessageSquare,
  Package,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmPaymentModal from "@/components/shared/ConfirmPaymentModal";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatDateShort, formatTime } from "@/lib/utils/format";
import {
  fetchPricingPackages,
  type PricingPackage,
} from "@/lib/pricing-packages";
import type { SmsHistoryItem } from "@/app/api/sms/history/route";
import type { AutomationRules } from "@/app/api/sms/automation/route";

interface Props {
  initialSmsRemaining: number;
  initialRules: AutomationRules;
}

function smsCount(pkg: PricingPackage): number {
  const value = pkg.meta?.sms_count;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function SmsCenterClient({
  initialSmsRemaining,
  initialRules,
}: Props) {
  const t = useTranslations("SMSCenter");
  const { user } = useAuth();
  const supabase = createClient();
  const [smsRemaining, setSmsRemaining] = useState(initialSmsRemaining);
  const [smsPackages, setSmsPackages] = useState<PricingPackage[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [confirmPkg, setConfirmPkg] = useState<PricingPackage | null>(null);
  const [rules, setRules] = useState<AutomationRules>(initialRules);
  const [history, setHistory] = useState<SmsHistoryItem[] | null>(null);
  const rulesRef = useRef(rules);
  const savedRulesRef = useRef(initialRules);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    void fetchPricingPackages(["sms"]).then(setSmsPackages);
  }, []);

  const reloadBalance = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("balances")
      .select("sms_remaining")
      .eq("user_id", user.id)
      .maybeSingle();
    setSmsRemaining(Number(data?.sms_remaining ?? 0));
  }, [user, supabase]);

  const reloadHistory = useCallback(async () => {
    const response = await fetch("/api/sms/history", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { items?: SmsHistoryItem[] };
    setHistory(payload.items ?? []);
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([reloadBalance(), reloadHistory()]);
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reloadBalance, reloadHistory]);

  const persistRules = useCallback(
    async (patch: Partial<AutomationRules>) => {
      try {
        const response = await fetch("/api/sms/automation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error(await response.text());
        const payload = (await response.json()) as { rules: AutomationRules };
        savedRulesRef.current = payload.rules;
        setRules((current) => ({ ...current, ...payload.rules }));
      } catch {
        setRules((current) => {
          const next = { ...current };
          for (const key of Object.keys(patch) as Array<keyof AutomationRules>) {
            if (current[key] === patch[key]) {
              next[key] = savedRulesRef.current[key] as never;
            }
          }
          return next;
        });
        toast.error(t("automation.saveError"));
      }
    },
    [t],
  );

  const buyPack = useCallback(
    async (pkg: PricingPackage) => {
      if (!user || buyingId) return;
      setBuyingId(pkg.id);
      try {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/purchase-vip`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session?.access_token ?? ""}`,
            },
            body: JSON.stringify({ package_id: pkg.id, quantity: 1 }),
          },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? t("purchaseFailed"));
        toast.success(`+${smsCount(pkg)} SMS`);
        await reloadBalance();
      } catch {
        toast.error(t("purchaseFailed"));
      } finally {
        setBuyingId(null);
      }
    },
    [user, buyingId, supabase, reloadBalance, t],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-[26px] font-black text-[#0F172A] sm:text-[28px]">
          <MessageSquare className="size-6 text-[#2563EB]" strokeWidth={2.4} />
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-[13px] text-[#64748B]">{t("pageSubtitle")}</p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <BalanceCard
          remaining={smsRemaining}
          packages={smsPackages}
          buyingId={buyingId}
          onBuy={setConfirmPkg}
        />
        <AutomationCard
          rules={rules}
          onToggle={(key, value) => {
            setRules((current) => ({ ...current, [key]: value }));
            void persistRules({ [key]: value });
          }}
          onFieldChange={(key, value) =>
            setRules((current) => ({ ...current, [key]: value }))
          }
          onFieldBlur={(key) => {
            void persistRules({ [key]: rulesRef.current[key] });
          }}
        />
      </div>

      <SmsHistoryTable items={history} />

      <ConfirmPaymentModal
        isOpen={Boolean(confirmPkg)}
        onClose={() => setConfirmPkg(null)}
        onConfirm={async () => {
          if (confirmPkg) await buyPack(confirmPkg);
        }}
        title={confirmPkg?.name ?? ""}
        priceLabel={confirmPkg ? `${confirmPkg.amount_gel.toFixed(2)} ₾` : ""}
      />
    </div>
  );
}

function BalanceCard({
  remaining,
  packages,
  buyingId,
  onBuy,
}: {
  remaining: number;
  packages: PricingPackage[];
  buyingId: string | null;
  onBuy: (pkg: PricingPackage) => void;
}) {
  const t = useTranslations("SMSCenter.balance");
  const primaryPackage = packages[0] ?? null;
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#2563EB] p-6 text-white shadow-[0px_10px_24px_-8px_rgba(37,99,235,0.45)]">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
          <MessageSquare className="size-3.5" strokeWidth={2.5} />
          {t("label")}
        </div>
        <p className="mt-3 text-[22px] font-black leading-8">
          {t("remaining", { count: remaining })}
        </p>
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-white/70">
          <Clock className="size-3.5" strokeWidth={2.4} />
          {t("automationOnly")}
        </p>
        <button
          type="button"
          onClick={() => primaryPackage && onBuy(primaryPackage)}
          disabled={!primaryPackage || Boolean(buyingId)}
          className="mt-5 flex h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-extrabold text-[#0F172A] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Package className="size-4" strokeWidth={2.4} />
          {buyingId ? t("buyingPackage") : t("buyPackage")}
        </button>
      </div>
    </div>
  );
}

type ToggleKey =
  | "check_in_reminder_enabled"
  | "review_request_enabled"
  | "win_back_enabled";

const AUTOMATION_ROWS: Array<{
  key: ToggleKey;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
}> = [
  { key: "check_in_reminder_enabled", icon: BadgeCheck, iconBg: "bg-[#DBEAFE]", iconColor: "text-[#2563EB]", titleKey: "checkInTitle", descKey: "checkInDesc" },
  { key: "review_request_enabled", icon: Star, iconBg: "bg-[#FEF3C7]", iconColor: "text-[#D97706]", titleKey: "reviewTitle", descKey: "reviewDesc" },
  { key: "win_back_enabled", icon: Heart, iconBg: "bg-[#FCE7F3]", iconColor: "text-[#DB2777]", titleKey: "winBackTitle", descKey: "winBackDesc" },
];

function AutomationCard({
  rules,
  onToggle,
  onFieldChange,
  onFieldBlur,
}: {
  rules: AutomationRules;
  onToggle: (key: ToggleKey, value: boolean) => void;
  onFieldChange: (key: "win_back_discount_value" | "win_back_discount_period", value: string) => void;
  onFieldBlur: (key: "win_back_discount_value" | "win_back_discount_period") => void;
}) {
  const t = useTranslations("SMSCenter.automation");
  return (
    <div className="rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="size-5 text-[#2563EB]" strokeWidth={2.4} />
        <h2 className="text-[18px] font-black text-[#0F172A]">{t("title")}</h2>
      </div>
      <ul className="space-y-3">
        {AUTOMATION_ROWS.map((row) => {
          const Icon = row.icon;
          const enabled = rules[row.key];
          const isWinBack = row.key === "win_back_enabled";
          return (
            <li key={row.key} className="rounded-2xl border border-[#F1F5F9] bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${row.iconBg} ${row.iconColor}`}>
                    <Icon className="size-[18px]" strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-[#0F172A]">{t(row.titleKey)}</p>
                    <p className="mt-0.5 text-[12px] leading-[18px] text-[#64748B]">{t(row.descKey)}</p>
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={(value) => onToggle(row.key, value)} aria-label={t(row.titleKey)} />
              </div>
              {isWinBack && enabled && (
                <div className="mt-4 grid gap-3 border-t border-[#F1F5F9] pt-4 sm:grid-cols-2">
                  <label className="text-[12px] font-bold text-[#475569]">
                    {t("discountValueLabel")} <span aria-hidden>*</span>
                    <input type="text" maxLength={10} required aria-required="true" value={rules.win_back_discount_value ?? ""} onChange={(event) => onFieldChange("win_back_discount_value", event.target.value)} onBlur={() => onFieldBlur("win_back_discount_value")} placeholder={t("discountValuePlaceholder")} className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB]" />
                  </label>
                  <label className="text-[12px] font-bold text-[#475569]">
                    {t("discountPeriodLabel")} <span aria-hidden>*</span>
                    <input type="text" maxLength={30} required aria-required="true" value={rules.win_back_discount_period ?? ""} onChange={(event) => onFieldChange("win_back_discount_period", event.target.value)} onBlur={() => onFieldBlur("win_back_discount_period")} placeholder={t("discountPeriodPlaceholder")} className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB]" />
                  </label>
                  {(!rules.win_back_discount_value?.trim() || !rules.win_back_discount_period?.trim()) && (
                    <p className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] font-medium leading-[17px] text-[#92400E] sm:col-span-2">{t("fallbackNotice")}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-[#FEF3C7] text-[#92400E]",
  approved: "bg-[#DBEAFE] text-[#1E40AF]",
  submitted: "bg-[#E0E7FF] text-[#3730A3]",
  sent: "bg-[#DCFCE7] text-[#166534]",
  failed: "bg-[#FEE2E2] text-[#991B1B]",
  rejected: "bg-[#FEE2E2] text-[#991B1B]",
};

function SmsHistoryTable({ items }: { items: SmsHistoryItem[] | null }) {
  const t = useTranslations("SMSCenter.history");
  return (
    <section className="mt-6 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6">
      <h2 className="mb-4 text-[16px] font-black text-[#0F172A]">{t("title")}</h2>
      {items === null ? (
        <div className="space-y-2.5">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center">
          <Bell className="mx-auto mb-2 size-7 text-[#94A3B8]" strokeWidth={1.8} />
          <p className="text-[13px] font-bold text-[#475569]">{t("empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead><tr className="border-b border-[#EEF1F4] text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]"><th className="pb-2.5 pr-3">{t("headers.type")}</th><th className="pb-2.5 pr-3">{t("headers.message")}</th><th className="pb-2.5 pr-3">{t("headers.date")}</th><th className="pb-2.5">{t("headers.status")}</th></tr></thead>
            <tbody>{items.map((item) => <HistoryRow key={item.id} item={item} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: SmsHistoryItem }) {
  const t = useTranslations("SMSCenter.history");
  return (
    <tr className="border-b border-[#F1F5F9] last:border-b-0">
      <td className="py-3 pr-3"><div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]"><AlarmClock className="size-4" /></span><div><p className="text-[13px] font-bold text-[#0F172A]">{t(`automationKind.${item.automation_kind}`)}</p><p className="text-[11px] text-[#64748B]">{t("kind.automation")}</p></div></div></td>
      <td className="py-3 pr-3"><p className="line-clamp-1 max-w-[360px] text-[12px] text-[#334155]">{item.message}</p></td>
      <td className="whitespace-nowrap py-3 pr-3 text-[12px]"><span className="block font-bold">{formatDateShort(item.created_at)}</span><span className="text-[11px] text-[#94A3B8]">{formatTime(item.created_at)}</span></td>
      <td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE_CLASS[item.status] ?? STATUS_BADGE_CLASS.pending}`}>{t(`status.${item.status}`)}</span></td>
    </tr>
  );
}
