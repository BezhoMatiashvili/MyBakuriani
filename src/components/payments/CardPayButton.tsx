"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  cardShortfallTetri,
  MAX_CARD_TOPUP_TETRI,
  tetriToGel,
} from "@/lib/payments/keepz/amount";
import type { PurchaseIntent } from "@/lib/payments/keepz/intent";
import {
  startCardCheckout,
  type CheckoutError,
} from "@/lib/payments/keepz/browser";

interface CardPayButtonProps {
  /** Full price of the purchase, in ₾. */
  total: number;
  /** Wallet balance the dialog showed, in ₾. */
  balance: number;
  /** The purchase the result page completes after the card payment. */
  resume: PurchaseIntent;
  /** Where the payer lands after Keepz; defaults to the current page. */
  returnPath?: string;
  /**
   * Called when a fresh read shows a different balance than `balance`; the
   * dialog re-renders with it (a wallet button, or a new card amount).
   */
  onBalanceChange: (balance: number) => void;
}

const gel = (tetri: number) => `${tetriToGel(tetri).toFixed(2)} ₾`;

// These leave no order the payer could use, so a retry needs a fresh key
// (the old one would only replay the dead order as a 409).
const RETRY_WITH_NEW_KEY = new Set<CheckoutError>([
  "request_conflict",
  "provider_rejected",
  "provider_unavailable",
]);

/**
 * "Pay by card" for a purchase the wallet cannot cover (C32). Keepz charges
 * only the missing amount, which is credited to the wallet; the result page
 * then completes this purchase through the normal purchase path, which prices
 * it itself. Renders nothing when the wallet already covers the purchase.
 */
export default function CardPayButton({
  total,
  balance,
  resume,
  returnPath,
  onBalanceChange,
}: CardPayButtonProps) {
  const t = useTranslations("Payments");
  const locale = useLocale();
  const pathname = usePathname();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  const shortfall = cardShortfallTetri(total, balance);
  // One idempotency key per (amount, purchase) attempt: a retry after a lost
  // response returns the same Keepz order instead of opening a second one.
  const attempt = useRef<{ key: string; requestId: string } | null>(null);

  if (shortfall === 0) return null;
  const overCap = shortfall > MAX_CARD_TOPUP_TETRI;

  async function pay() {
    if (!user) return;
    setBusy(true);
    setError(null);
    // The wallet may have changed since the dialog opened (another tab, a
    // refund): re-read it so the card is never charged for the wrong amount.
    const { data, error: balanceError } = await createClient()
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .maybeSingle();
    if (balanceError) {
      setError("network");
      setBusy(false);
      return;
    }
    const fresh = Number(data?.amount ?? 0);
    if (cardShortfallTetri(total, fresh) !== shortfall) {
      onBalanceChange(fresh);
      setBusy(false);
      return;
    }
    const key = `${shortfall}|${JSON.stringify(resume)}`;
    if (attempt.current?.key !== key) {
      attempt.current = { key, requestId: crypto.randomUUID() };
    }
    const failure = await startCardCheckout({
      requestId: attempt.current.requestId,
      amount: tetriToGel(shortfall),
      returnPath: returnPath ?? pathname,
      locale,
      resume,
    });
    if (failure) {
      if (RETRY_WITH_NEW_KEY.has(failure)) attempt.current = null;
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] text-[#475569]">
        {overCap
          ? t("cardOverCap", { max: gel(MAX_CARD_TOPUP_TETRI) })
          : t("cardHint", {
              balance: `${balance.toFixed(2)} ₾`,
              amount: gel(shortfall),
            })}
      </p>
      <button
        type="button"
        onClick={pay}
        disabled={busy || overCap || !user}
        data-testid="card-pay-button"
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {busy ? t("redirecting") : t("cardButton", { amount: gel(shortfall) })}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#64748B]">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        {t("secureNote")}
      </p>
      {error && (
        <p role="alert" className="text-[12px] font-medium text-[#DC2626]">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
