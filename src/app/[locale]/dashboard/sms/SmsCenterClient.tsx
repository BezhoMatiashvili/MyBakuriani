"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  Clock,
  Heart,
  Info,
  MessageSquare,
  Package,
  Send,
  Sparkles,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StyledSelect } from "@/components/ui/styled-select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  fetchPricingPackages,
  type PricingPackage,
} from "@/lib/pricing-packages";
import {
  AUDIENCES_BY_ROLE,
  type SenderRole,
  type SmsAudience,
} from "@/lib/sms/audience";
import type { SmsHistoryItem } from "@/app/api/sms/history/route";
import type { AutomationRules } from "@/app/api/sms/automation/route";

const MAX_MESSAGE = 320;
const SMS_SEGMENT = 70;

interface Props {
  role: SenderRole;
  senderName: string | null;
  initialSmsRemaining: number;
  initialRules: AutomationRules;
}

function smsCount(pkg: PricingPackage): number {
  const v = pkg.meta?.sms_count;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function segmentCount(len: number): number {
  if (len === 0) return 1;
  return Math.max(1, Math.ceil(len / SMS_SEGMENT));
}

export function SmsCenterClient({
  role,
  senderName,
  initialSmsRemaining,
  initialRules,
}: Props) {
  const t = useTranslations("SMSCenter");
  const { user } = useAuth();
  const supabase = createClient();
  const [smsRemaining, setSmsRemaining] = useState(initialSmsRemaining);
  const [smsPackages, setSmsPackages] = useState<PricingPackage[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const audiences = useMemo(() => AUDIENCES_BY_ROLE[role] ?? [], [role]);
  const [audience, setAudience] = useState<SmsAudience>(
    () => audiences[0] ?? "renter_past_guests",
  );
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [rules, setRules] = useState<AutomationRules>(initialRules);
  const [history, setHistory] = useState<SmsHistoryItem[] | null>(null);
  const savingRef = useRef<number | null>(null);

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
    const res = await fetch("/api/sms/history", { cache: "no-store" });
    const json = await res.json();
    setHistory(json.items ?? []);
  }, []);

  const reloadAudienceCount = useCallback(async (aud: SmsAudience) => {
    setAudienceCount(null);
    try {
      const res = await fetch(
        `/api/sms/audience/count?audience=${encodeURIComponent(aud)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      setAudienceCount(Number(json.count ?? 0));
    } catch {
      setAudienceCount(0);
    }
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);

  useEffect(() => {
    void reloadAudienceCount(audience);
  }, [audience, reloadAudienceCount]);

  // Live subscription: when admin moderates an SMS row of mine, refresh history.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sms-center-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_outbound",
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          void reloadHistory();
          void reloadBalance();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_broadcasts",
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          void reloadHistory();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, supabase, reloadHistory, reloadBalance]);

  const persistRules = useCallback(
    async (next: AutomationRules) => {
      if (savingRef.current) window.clearTimeout(savingRef.current);
      savingRef.current = window.setTimeout(async () => {
        try {
          const res = await fetch("/api/sms/automation", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch {
          toast.error(t("automation.saveError"));
        }
      }, 300);
    },
    [t],
  );

  const toggleRule = useCallback(
    (key: keyof AutomationRules, value: boolean) => {
      setRules((prev) => {
        const next: AutomationRules = { ...prev, [key]: value };
        void persistRules(next);
        return next;
      });
    },
    [persistRules],
  );

  const buyPack = useCallback(
    async (pkg: PricingPackage) => {
      if (!user || buyingId) return;
      setBuyingId(pkg.id);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/purchase-vip`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ package_id: pkg.id, quantity: 1 }),
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "შესყიდვა ვერ მოხერხდა");
        toast.success(`+${smsCount(pkg)} SMS`);
        await reloadBalance();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setBuyingId(null);
      }
    },
    [user, supabase, buyingId, reloadBalance],
  );

  const sendBroadcast = useCallback(async () => {
    if (sending || !message.trim() || !audienceCount) return;
    setSending(true);
    try {
      const res = await fetch("/api/sms/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, message: message.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        const errKey = (json?.error ?? "unknown") as string;
        const msg =
          (t.raw("broadcast.errors") as Record<string, string>)[errKey] ??
          (t.raw("broadcast.errors") as Record<string, string>).unknown;
        toast.error(msg);
        return;
      }
      toast.success(
        t("broadcast.sentSuccess", { count: json.recipient_count ?? 0 }),
      );
      setMessage("");
      await Promise.all([reloadHistory(), reloadBalance()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setSending(false);
    }
  }, [
    sending,
    message,
    audience,
    audienceCount,
    t,
    reloadHistory,
    reloadBalance,
  ]);

  const audienceOptions = useMemo(
    () =>
      audiences.map((a) => ({
        value: a,
        label: t(`audiences.${a}`),
      })),
    [audiences, t],
  );

  const segments = segmentCount(message.length);
  const totalSmsCost = (audienceCount ?? 0) * segments;
  const canSend =
    !sending &&
    message.trim().length > 0 &&
    message.length <= MAX_MESSAGE &&
    (audienceCount ?? 0) > 0 &&
    smsRemaining >= totalSmsCost;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-[26px] font-black text-[#0F172A] sm:text-[28px]">
          <MessageSquare className="size-6 text-[#2563EB]" strokeWidth={2.4} />
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-[13px] text-[#64748B]">{t("pageSubtitle")}</p>
      </header>

      {/* Row 1: balance + automation */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <BalanceCard
          remaining={smsRemaining}
          packages={smsPackages}
          buyingId={buyingId}
          onBuy={buyPack}
        />
        <AutomationCard rules={rules} onToggle={toggleRule} />
      </div>

      {/* Row 2: broadcast */}
      <section className="mt-5 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles
            className="size-5 text-[#2563EB]"
            strokeWidth={2.4}
            aria-hidden
          />
          <h2 className="text-[18px] font-black text-[#0F172A]">
            {t("broadcast.title")}
          </h2>
          <span className="text-[12px] font-bold tracking-wider text-[#94A3B8]">
            {t("broadcast.subtitle")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-[12px] font-bold text-[#475569]">
                {t("broadcast.audienceLabel")}
              </label>
              <StyledSelect<SmsAudience>
                value={audience}
                onValueChange={setAudience}
                options={audienceOptions}
                placeholder={t("broadcast.audiencePlaceholder")}
              />
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-[12px] leading-[18px] text-[#1E3A8A]">
              <Info
                className="mt-0.5 size-4 shrink-0 text-[#2563EB]"
                strokeWidth={2.4}
              />
              <p>{t("broadcast.compliance")}</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-end justify-between">
                <label className="text-[12px] font-bold text-[#475569]">
                  {t("broadcast.messageLabel")}
                </label>
                <span className="text-[11px] font-bold text-[#94A3B8]">
                  {message.length} / {SMS_SEGMENT}{" "}
                  <span className="text-[#64748B]">({segments} SMS)</span>
                </span>
              </div>
              <Textarea
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MAX_MESSAGE))
                }
                placeholder={t("broadcast.messagePlaceholder")}
                rows={5}
                className="min-h-[120px]"
              />
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                <Info className="size-3.5" strokeWidth={2} />
                {t("broadcast.complianceFooter")}
              </p>
            </div>

            <button
              type="button"
              onClick={sendBroadcast}
              disabled={!canSend}
              className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#0F172A] text-[14px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(15,23,42,0.45)] transition-all hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#94A3B8] disabled:shadow-none"
            >
              <Send className="size-4" strokeWidth={2.4} />
              {sending
                ? t("broadcast.sending")
                : t("broadcast.sendButton")}{" "}
              <span className="font-bold opacity-80">
                {t("broadcast.sendCount", { count: totalSmsCost || 0 })}
              </span>
            </button>
          </div>

          <PhonePreview
            label={t("preview.deviceLabel")}
            message={message}
            emptyText={t("preview.emptyText")}
            senderName={senderName}
          />
        </div>
      </section>

      {/* Row 3: history */}
      <SmsHistoryTable items={history} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BalanceCard — dark gradient with credit + buy CTA
// ---------------------------------------------------------------------------
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
  const primaryPkg = packages[0] ?? null;

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#2563EB] p-6 text-white shadow-[0px_10px_24px_-8px_rgba(37,99,235,0.45)]">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 size-32 rounded-full bg-white/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
          <MessageSquare className="size-3.5" strokeWidth={2.5} />
          {t("label")}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-[48px] font-black leading-none">{remaining}</p>
          <span className="text-[13px] font-bold text-white/70">
            {t("unit")}
          </span>
        </div>
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-white/70">
          <Clock className="size-3.5" strokeWidth={2.4} />
          {t("lastBroadcast")}
        </p>

        <button
          type="button"
          onClick={() => primaryPkg && onBuy(primaryPkg)}
          disabled={!primaryPkg || Boolean(buyingId)}
          className="mt-5 flex h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-extrabold text-[#0F172A] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Package className="size-4" strokeWidth={2.4} />
          {buyingId ? t("buyingPackage") : t("buyPackage")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutomationCard — 3 toggle rows with icon + label + desc + switch
// ---------------------------------------------------------------------------
const AUTOMATION_ROWS: Array<{
  key: keyof AutomationRules;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
  paramKey: keyof AutomationRules;
  paramI18nVar: "hours" | "days";
}> = [
  {
    key: "check_in_reminder_enabled",
    icon: BadgeCheck,
    iconBg: "bg-[#DBEAFE]",
    iconColor: "text-[#2563EB]",
    titleKey: "checkInTitle",
    descKey: "checkInDesc",
    paramKey: "check_in_reminder_hours_before",
    paramI18nVar: "hours",
  },
  {
    key: "review_request_enabled",
    icon: Star,
    iconBg: "bg-[#FEF3C7]",
    iconColor: "text-[#D97706]",
    titleKey: "reviewTitle",
    descKey: "reviewDesc",
    paramKey: "review_request_hours_after",
    paramI18nVar: "hours",
  },
  {
    key: "win_back_enabled",
    icon: Heart,
    iconBg: "bg-[#FCE7F3]",
    iconColor: "text-[#DB2777]",
    titleKey: "winBackTitle",
    descKey: "winBackDesc",
    paramKey: "win_back_days_after",
    paramI18nVar: "days",
  },
];

function AutomationCard({
  rules,
  onToggle,
}: {
  rules: AutomationRules;
  onToggle: (key: keyof AutomationRules, value: boolean) => void;
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
          const enabled = Boolean(rules[row.key]);
          const param = Number(rules[row.paramKey] ?? 0);
          return (
            <li
              key={row.key}
              className="flex items-start justify-between gap-3 rounded-2xl border border-[#F1F5F9] bg-white p-3.5 transition-colors hover:border-[#E2E8F0]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${row.iconBg} ${row.iconColor}`}
                >
                  <Icon className="size-[18px]" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#0F172A]">
                    {t(row.titleKey)}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[18px] text-[#64748B]">
                    {t(row.descKey, { [row.paramI18nVar]: param })}
                  </p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => onToggle(row.key, v)}
                aria-label={t(row.titleKey)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhonePreview — iPhone-style mock showing live message
// ---------------------------------------------------------------------------
function PhonePreview({
  label,
  message,
  emptyText,
  senderName,
}: {
  label: string;
  message: string;
  emptyText: string;
  senderName: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[32px] border-[6px] border-[#0F172A] bg-[#F8FAFC] p-3 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.45)]">
      <div className="mb-2 flex items-center justify-center gap-1.5 pt-1">
        <span className="h-1.5 w-12 rounded-full bg-[#0F172A]/80" />
      </div>
      <div className="rounded-[24px] bg-white p-3">
        <div className="mb-3 flex items-center gap-2 border-b border-[#EEF1F4] pb-2">
          <ArrowUpRight className="size-3.5 text-[#94A3B8]" strokeWidth={2.4} />
          <p className="text-[11px] font-bold text-[#0F172A]">{label}</p>
        </div>
        <div className="min-h-[140px]">
          <div className="inline-block max-w-full rounded-2xl rounded-bl-md bg-[#EFF6FF] px-3 py-2 text-[11px] leading-[16px] text-[#0F172A] shadow-sm">
            {message.trim() || (
              <span className="text-[#94A3B8]">{emptyText}</span>
            )}
          </div>
          {senderName && message.trim() && (
            <p className="mt-1 text-[10px] text-[#94A3B8]">— {senderName}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SmsHistoryTable — last 30 events (broadcasts + automation + contacts)
// ---------------------------------------------------------------------------
const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-[#FEF3C7] text-[#92400E]",
  approved: "bg-[#DBEAFE] text-[#1E40AF]",
  rejected: "bg-[#FEE2E2] text-[#991B1B]",
  sent: "bg-[#DCFCE7] text-[#166534]",
  failed: "bg-[#FEE2E2] text-[#991B1B]",
  partial_approved: "bg-[#FEF3C7] text-[#92400E]",
};

function SmsHistoryTable({ items }: { items: SmsHistoryItem[] | null }) {
  const t = useTranslations("SMSCenter.history");

  return (
    <section className="mt-6 rounded-[20px] border border-[#EEF1F4] bg-white p-5 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-black text-[#0F172A]">{t("title")}</h2>
      </div>

      {items === null ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center">
          <Bell
            className="mx-auto mb-2 size-7 text-[#94A3B8]"
            strokeWidth={1.8}
          />
          <p className="text-[13px] font-bold text-[#475569]">{t("empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#EEF1F4] text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
                <th className="pb-2.5 pr-3 font-bold">{t("headers.type")}</th>
                <th className="pb-2.5 pr-3 font-bold">
                  {t("headers.message")}
                </th>
                <th className="pb-2.5 pr-3 font-bold">{t("headers.date")}</th>
                <th className="pb-2.5 font-bold">{t("headers.status")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <HistoryRow key={`${it.kind}-${it.id}`} item={it} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: SmsHistoryItem }) {
  const t = useTranslations("SMSCenter.history");
  const tAudience = useTranslations("SMSCenter.audiences");

  const typeLabel =
    item.kind === "automation" && item.automation_kind
      ? t(`automationKind.${item.automation_kind}`)
      : item.kind === "broadcast"
        ? t("kind.broadcast")
        : t("kind.contact");

  const subLabel =
    item.kind === "broadcast" && item.audience
      ? tAudience(item.audience)
      : item.kind === "automation"
        ? t("kind.automation")
        : t("recipients", { count: item.recipient_count });

  const TypeIcon =
    item.kind === "automation"
      ? AlarmClock
      : item.kind === "broadcast"
        ? Sparkles
        : CheckCircle2;

  const date = new Date(item.created_at);
  const dateLabel = date.toLocaleDateString("ka-GE", {
    day: "numeric",
    month: "short",
  });
  const timeLabel = date.toLocaleTimeString("ka-GE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <tr className="border-b border-[#F1F5F9] last:border-b-0">
      <td className="py-3 pr-3 align-middle">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
            <TypeIcon className="size-[16px]" strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-[#0F172A]">
              {typeLabel}
            </p>
            <p className="truncate text-[11px] text-[#64748B]">{subLabel}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3 align-middle">
        <p className="line-clamp-1 max-w-[320px] text-[12px] text-[#334155]">
          {item.message}
        </p>
      </td>
      <td className="py-3 pr-3 align-middle whitespace-nowrap text-[12px] text-[#475569]">
        <div className="flex flex-col">
          <span className="font-bold text-[#0F172A]">{dateLabel}</span>
          <span className="text-[11px] text-[#94A3B8]">{timeLabel}</span>
        </div>
      </td>
      <td className="py-3 align-middle">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
            STATUS_BADGE_CLASS[item.status] ?? STATUS_BADGE_CLASS.pending
          }`}
        >
          {t(`status.${item.status}`)}
        </span>
      </td>
    </tr>
  );
}
