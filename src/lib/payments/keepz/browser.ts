import { createClient } from "@/lib/supabase/client";
import { promotionPurchaseError } from "@/lib/promotion-purchase";
import type { PurchaseIntent } from "./intent";

/**
 * Browser side of Keepz card payments (C32). Card details are typed on Keepz's
 * hosted page only — nothing here ever sees them.
 */

// Keepz's return URL is static and carries no order id, so the tab remembers
// which payment it is waiting for. Not a secret: only the owner can read it.
const PENDING_KEY = "mb-keepz-payment";

export const CHECKOUT_ERRORS = [
  "payments_unavailable",
  "rate_limited",
  "too_many_open_orders",
  "invalid_amount",
  "request_conflict",
  "provider_rejected",
  "provider_unavailable",
  "network",
  "failed",
] as const;
export type CheckoutError = (typeof CHECKOUT_ERRORS)[number];

export function rememberPendingPayment(paymentId: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, paymentId);
  } catch {}
}

export function readPendingPayment(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function forgetPendingPayment() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

/**
 * Creates the Keepz order and navigates to Keepz's checkout page. Resolves to
 * null once the navigation has started, or to an error code. Reuse the same
 * `requestId` for a retry of the same payment: the server then returns the
 * order it already created instead of opening a second one.
 */
export async function startCardCheckout(input: {
  requestId: string;
  amount: number;
  returnPath: string;
  locale: string;
  resume?: PurchaseIntent | null;
}): Promise<CheckoutError | null> {
  let response: Response;
  try {
    response = await fetch("/api/payments/keepz/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId,
        amount: input.amount,
        returnPath: input.returnPath,
        locale: input.locale,
        resume: input.resume ?? null,
      }),
    });
  } catch {
    return "network";
  }
  const payload = (await response.json().catch(() => null)) as {
    paymentId?: string;
    checkoutUrl?: string;
    error?: string;
  } | null;

  if (response.ok && payload?.paymentId && payload.checkoutUrl) {
    let url: URL;
    try {
      url = new URL(payload.checkoutUrl);
    } catch {
      return "failed";
    }
    if (url.protocol !== "https:") return "failed";
    rememberPendingPayment(payload.paymentId);
    window.location.assign(url.toString());
    return null;
  }
  const code = payload?.error ?? "";
  return (CHECKOUT_ERRORS as readonly string[]).includes(code)
    ? (code as CheckoutError)
    : "failed";
}

/**
 * Completes the purchase a card top-up was for, through the same endpoints the
 * dialogs use (they re-validate and re-price everything). Throws a
 * user-facing Error when the purchase does not go through.
 */
export async function executePurchaseIntent(
  intent: PurchaseIntent,
  messages: {
    vipConflict: string;
    network: string;
    generic: string;
    insufficient: string;
  },
): Promise<void> {
  if (intent.kind === "menu-item-discount") {
    let response: Response;
    try {
      response = await fetch("/api/food/menu-item-discount-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent.body),
      });
    } catch {
      throw new Error(messages.network);
    }
    if (response.ok) return;
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error === "insufficient_balance"
        ? messages.insufficient
        : messages.generic,
    );
  }

  const supabase = createClient();
  const { error } =
    intent.kind === "purchase-vip"
      ? await supabase.functions.invoke("purchase-vip", { body: intent.body })
      : await supabase.functions.invoke("company-subscription", {
          body: intent.body,
        });
  if (error) throw await promotionPurchaseError(error, messages);
}
