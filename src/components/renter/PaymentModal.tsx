"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import CardPayButton from "@/components/payments/CardPayButton";
import { cardShortfallTetri } from "@/lib/payments/keepz/amount";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";
import { formatGelAmount } from "@/lib/utils/pricing";
import type { RenterMembershipPlan } from "@/app/[locale]/dashboard/renter/loadOverview";
import {
  MEMBERSHIP_SEASONS,
  windowsOverlap,
  type MembershipWindow,
} from "@/lib/membership/plans";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  membershipExpiresAt: string | null;
  membershipPending: boolean;
  membershipPendingStartsAt: string | null;
  membershipPendingExpiresAt: string | null;
  /** Remaining windows already paid for (active or pending). */
  membershipCovered: MembershipWindow[];
  walletBalance: number;
  plans: RenterMembershipPlan[];
  onPurchased: () => Promise<void>;
}

// The purchasable part of a plan's season: from now for the running season,
// from the season start for the coming one (mirrors purchase_renter_membership).
function planWindow(
  plan: RenterMembershipPlan,
  nowMs: number,
): MembershipWindow {
  const start = Math.max(Date.parse(plan.window_start), nowMs);
  return {
    startsAt: new Date(start).toISOString(),
    expiresAt: plan.window_end,
  };
}

// purchase-vip answers membership conflicts with fixed English strings.
const EDGE_ERROR_KEYS: Record<
  string,
  "alreadyPending" | "alreadyActive" | "unavailable" | "fbProfileRequired"
> = {
  "Membership payment is already awaiting admin approval.": "alreadyPending",
  "A seasonal membership is already active.": "alreadyActive",
  "This seasonal membership package is not available.": "unavailable",
  "A Facebook profile link is required for this membership tier.":
    "fbProfileRequired",
};

// Same https-only, 300-char guard as purchase-vip and the DB CHECK constraint
// on user_subscriptions.fb_profile_url — keep the three in sync.
const FB_PROFILE_URL_RE = /^https:\/\/.+/i;

function normalizeFbProfileUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  return /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// UX-only: a stricter Facebook-host check than the backend enforces, so the
// dialog can catch an obviously-wrong paste before it ever reaches an admin.
const FB_PROFILE_HOST_RE = /^https:\/\/([\w-]+\.)?(facebook|fb)\.com\/.+/i;

function isValidFbProfileUrl(raw: string): boolean {
  const normalized = normalizeFbProfileUrl(raw);
  return (
    normalized.length <= 300 &&
    FB_PROFILE_URL_RE.test(normalized) &&
    FB_PROFILE_HOST_RE.test(normalized)
  );
}

const PROCESS_STEPS = ["1", "2", "3", "4"] as const;

/**
 * Seasonal renter membership purchase dialog (2026 price list §1): Summer
 * (April–October) and Winter (November–March), 30 ₾ for "our Facebook group
 * VIP member" (self-declared, verified by an admin) or 60 ₾. Payment never
 * activates on its own — the admin approves first.
 */
export default function PaymentModal({
  isOpen,
  onClose,
  membershipExpiresAt,
  membershipPending,
  membershipPendingStartsAt,
  membershipPendingExpiresAt,
  membershipCovered,
  walletBalance,
  plans,
  onPurchased,
}: PaymentModalProps) {
  const t = useTranslations("PaymentModal");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [declared, setDeclared] = useState(false);
  const [fbProfileUrl, setFbProfileUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // CardPayButton re-reads the wallet before charging; a changed balance
  // lands here so the dialog re-decides between wallet and card.
  const [liveWallet, setLiveWallet] = useState(walletBalance);
  const isActive = Boolean(membershipExpiresAt);

  useEffect(() => {
    setLiveWallet(walletBalance);
  }, [walletBalance, isOpen]);

  const isCovered = (plan: RenterMembershipPlan) =>
    membershipCovered.some((window) =>
      windowsOverlap(window, planWindow(plan, nowMs)),
    );

  useEffect(() => {
    if (!isOpen) return;
    setDeclared(false);
    setFbProfileUrl("");
    setError(null);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // A background refresh (the dashboard's realtime membership subscription)
  // replaces plans/covered windows; keep the owner's choice while it is still
  // purchasable and re-pick only when it disappeared or became covered.
  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    setNowMs(now);
    const purchasable = (plan: RenterMembershipPlan) =>
      !membershipCovered.some((window) =>
        windowsOverlap(window, planWindow(plan, now)),
      );
    setSelectedId((current) => {
      const kept = plans.find((plan) => plan.id === current);
      return kept && purchasable(kept)
        ? kept.id
        : (plans.find(purchasable)?.id ?? null);
    });
  }, [isOpen, plans, membershipCovered]);

  // The Facebook-group declaration belongs to one plan choice.
  useEffect(() => {
    setDeclared(false);
    setFbProfileUrl("");
  }, [selectedId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const seasonGroups = useMemo(
    () =>
      MEMBERSHIP_SEASONS.map((season) => ({
        season,
        plans: plans.filter((plan) => plan.season === season),
      })).filter((group) => group.plans.length > 0),
    [plans],
  );

  const selectedPlan = plans.find((plan) => plan.id === selectedId) ?? null;
  const needsDeclaration = selectedPlan?.price_tier === "fb_group_vip";
  const fbProfileReady =
    !needsDeclaration || (declared && isValidFbProfileUrl(fbProfileUrl));
  const canPay =
    Boolean(selectedPlan) &&
    !submitting &&
    !membershipPending &&
    !(selectedPlan && isCovered(selectedPlan)) &&
    fbProfileReady;
  // A short wallet pays the missing part by card, then the same purchase is
  // completed after the top-up (C32).
  const payByCard =
    canPay &&
    !!selectedPlan &&
    cardShortfallTetri(Number(selectedPlan.amount_gel), liveWallet) > 0;

  async function purchase() {
    if (!selectedPlan || !canPay) return;
    setSubmitting(true);
    setError(null);
    const { error: invokeError } = await supabase.functions.invoke(
      "purchase-vip",
      {
        body: {
          package_id: selectedPlan.id,
          quantity: 1,
          ...(needsDeclaration && {
            fb_profile_url: normalizeFbProfileUrl(fbProfileUrl),
          }),
        },
      },
    );
    if (invokeError) {
      const message = await edgeErrorMessage(
        invokeError,
        tShared("purchaseNetworkError"),
      );
      const key = message ? EDGE_ERROR_KEYS[message] : undefined;
      setError(key ? t(`errors.${key}`) : (message ?? t("purchaseFailed")));
      setSubmitting(false);
      return;
    }
    await onPurchased();
    setSubmitting(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="membership-dialog-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between px-6 pt-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                  <CreditCard className="h-[18px] w-[18px]" />
                </span>
                <h2
                  id="membership-dialog-title"
                  className="text-[17px] font-extrabold text-[#0F172A]"
                >
                  {t("title")}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
                aria-label={tShared("closeAria")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mx-6 mt-5 rounded-2xl border border-[#EEF1F4] bg-[#FAFBFC] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-[#64748B]">
                  {t("walletBalance")}
                </span>
                <span className="inline-flex items-center gap-1.5 text-lg font-black text-[#0F172A]">
                  <Wallet className="h-4 w-4 text-[#2563EB]" />
                  {formatGelAmount(liveWallet)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-[#EEF1F4] pt-3">
                <span className="text-sm font-semibold text-[#64748B]">
                  {isActive ? t("validUntil") : t("membershipStatus")}
                </span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#059669]">
                    <CheckCircle2 className="h-4 w-4" />
                    {formatDate(membershipExpiresAt, locale)}
                  </span>
                ) : membershipPending ? (
                  <span className="inline-flex items-center gap-1.5 text-right text-sm font-extrabold text-[#B45309]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {t("awaitingApproval")}
                    {membershipPendingStartsAt && membershipPendingExpiresAt
                      ? ` · ${formatDate(membershipPendingStartsAt, locale)} – ${formatDate(membershipPendingExpiresAt, locale)}`
                      : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#DC2626]">
                    <AlertCircle className="h-4 w-4" />
                    {t("inactive")}
                  </span>
                )}
              </div>
            </div>

            <p className="mx-6 mt-5 text-[13px] leading-[20px] text-[#64748B]">
              {membershipPending ? t("alreadyPending") : t("intro")}
            </p>

            {seasonGroups.length > 0 ? (
              <div className="mx-6 mt-4 space-y-4">
                {seasonGroups.map(({ season, plans: seasonPlans }) => {
                  const window = planWindow(seasonPlans[0], nowMs);
                  return (
                    <div
                      key={season}
                      data-testid={`membership-season-${season}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-extrabold text-[#0F172A]">
                          {t(`seasons.${season}`)}{" "}
                          <span className="font-semibold text-[#64748B]">
                            ({t(`seasonPeriods.${season}`)})
                          </span>
                        </p>
                        <p className="text-xs font-semibold text-[#64748B]">
                          {t("validity", {
                            start: formatDate(window.startsAt, locale),
                            end: formatDate(window.expiresAt, locale),
                          })}
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {seasonPlans.map((plan) => {
                          const selected = plan.id === selectedId;
                          const covered = isCovered(plan);
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              data-testid={`membership-plan-${plan.code}`}
                              onClick={() => setSelectedId(plan.id)}
                              disabled={covered}
                              aria-pressed={selected}
                              className={`rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${selected ? "border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]" : "border-[#E2E8F0] hover:border-[#93C5FD]"}`}
                            >
                              <span className="block text-[13px] font-bold leading-[18px] text-[#0F172A]">
                                {plan.price_tier === "fb_group_vip"
                                  ? t("tiers.fb_group_vip")
                                  : t("tiers.standard")}
                              </span>
                              <span className="mt-2 block text-xl font-black text-[#2563EB]">
                                {formatGelAmount(Number(plan.amount_gel))}
                              </span>
                              {covered && (
                                <span className="mt-1 block text-[11px] font-semibold text-[#059669]">
                                  {t("planCovered")}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mx-6 mt-4 rounded-xl bg-[#FFF7ED] p-3 text-sm font-semibold text-[#9A3412]">
                {t("noPlans")}
              </p>
            )}

            {needsDeclaration && (
              <div className="mx-6 mt-4 space-y-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[12px] font-medium leading-[18px] text-[#92400E]">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={declared}
                    onChange={(event) => setDeclared(event.target.checked)}
                    data-testid="membership-fb-declaration"
                    className="mt-0.5 size-4 shrink-0 accent-[#2563EB]"
                  />
                  <span>{t("fbDeclaration")}</span>
                </label>
                {declared && (
                  <div>
                    <label
                      htmlFor="membership-fb-profile-url"
                      className="mb-1 block text-[11px] font-bold"
                    >
                      {t("fbProfileLabel")}
                    </label>
                    <input
                      id="membership-fb-profile-url"
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      value={fbProfileUrl}
                      onChange={(event) => setFbProfileUrl(event.target.value)}
                      placeholder={t("fbProfilePlaceholder")}
                      data-testid="membership-fb-profile-url"
                      className="w-full rounded-lg border border-[#FDE68A] bg-white px-3 py-2 text-[13px] font-medium text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                    {fbProfileUrl.length > 0 &&
                      !isValidFbProfileUrl(fbProfileUrl) && (
                        <p className="mt-1 text-[11px] font-semibold text-[#B91C1C]">
                          {t("fbProfileInvalid")}
                        </p>
                      )}
                  </div>
                )}
              </div>
            )}

            <div className="mx-6 mt-4 rounded-xl border border-[#EEF1F4] bg-[#FAFBFC] p-3.5 text-[12px] leading-[18px] text-[#475569]">
              <p className="font-bold text-[#0F172A]">{t("processTitle")}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                {PROCESS_STEPS.map((step) => (
                  <li key={step}>{t(`processSteps.${step}`)}</li>
                ))}
              </ol>
              <p className="mt-2">{t("refundOnReject")}</p>
            </div>

            {error ? (
              <div
                className="mx-6 mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-sm font-semibold text-[#B91C1C]"
                role="alert"
              >
                {error}{" "}
                <Link
                  href="/dashboard/renter/balance"
                  className="ml-1 underline"
                >
                  {t("goToBalance")}
                </Link>
              </div>
            ) : null}

            <div className="px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
              {payByCard && selectedPlan ? (
                <CardPayButton
                  total={Number(selectedPlan.amount_gel)}
                  balance={liveWallet}
                  resume={{
                    kind: "purchase-vip",
                    body: {
                      package_id: selectedPlan.id,
                      quantity: 1,
                      ...(needsDeclaration && {
                        fb_profile_url: normalizeFbProfileUrl(fbProfileUrl),
                      }),
                    },
                  }}
                  onBalanceChange={setLiveWallet}
                />
              ) : (
                <button
                  type="button"
                  onClick={purchase}
                  disabled={!canPay}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3.5 text-sm font-bold text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {membershipPending ? t("awaitingApproval") : t("payButton")}
                </button>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

async function edgeErrorMessage(
  error: unknown,
  networkMessage: string,
): Promise<string | null> {
  // supabase-js wraps non-2xx Edge responses in FunctionHttpError. Its public
  // message is generic; the response body carries the vetted ApiError text.
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    (error as { context?: unknown }).context instanceof Response
  ) {
    try {
      const body = (await (error as { context: Response }).context
        .clone()
        .json()) as { error?: unknown };
      return typeof body.error === "string" ? body.error : null;
    } catch {
      return null;
    }
  }
  // No Response at all means the fetch itself failed, and `error.message` is
  // then supabase-js's internal English "Failed to send a request to the Edge
  // Function" — which used to be printed verbatim into this Georgian dialog.
  return networkMessage;
}
