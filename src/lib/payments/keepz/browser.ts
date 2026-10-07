import { hasLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
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

/** `?tab=1` tells the result page that Keepz is open in another tab. */
export const CHECKOUT_TAB_PARAM = "tab";

/**
 * Opens the empty tab Keepz's checkout will load in. Call it synchronously in
 * the click handler, before any await, or the browser blocks it. Null when it
 * was blocked (in-app browsers, strict popup settings).
 */
export function openCheckoutTab(): Window | null {
  try {
    return window.open("", "_blank");
  } catch {
    return null;
  }
}

function closeTab(tab: Window | null | undefined) {
  try {
    tab?.close();
  } catch {}
}

/**
 * Creates the Keepz order and opens Keepz's checkout page. Resolves to null
 * once the navigation has started, or to an error code (the tab is closed
 * then). Reuse the same `requestId` for a retry of the same payment: the
 * server then returns the order it already created instead of opening a
 * second one.
 *
 * With a `tab` from openCheckoutTab, Keepz loads there and this tab moves to
 * the result page, which waits for the payment and completes the purchase:
 * Keepz has no return redirect registered for us, so a payer sent away in
 * this tab never comes back to finish it (C32). Without one, this tab goes
 * to Keepz as before.
 */
export async function startCardCheckout(input: {
  requestId: string;
  amount: number;
  returnPath: string;
  locale: string;
  resume?: PurchaseIntent | null;
  tab?: Window | null;
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
    closeTab(input.tab);
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
      closeTab(input.tab);
      return "failed";
    }
    if (url.protocol !== "https:") {
      closeTab(input.tab);
      return "failed";
    }
    rememberPendingPayment(payload.paymentId);
    const tab = input.tab;
    if (tab && !tab.closed) {
      // Keepz's page must not reach back into this tab.
      tab.opener = null;
      tab.location.replace(url.toString());
      window.location.assign(
        getPathname({
          href: {
            pathname: "/dashboard/payments/result",
            query: { [CHECKOUT_TAB_PARAM]: "1" },
          },
          locale: hasLocale(routing.locales, input.locale)
            ? input.locale
            : routing.defaultLocale,
        }),
      );
    } else {
      window.location.assign(url.toString());
    }
    return null;
  }
  closeTab(input.tab);
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
