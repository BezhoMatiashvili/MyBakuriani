/** Reason tokens purchase-vip returns (purchase_package HINTs, C10). */
export const PURCHASE_REASONS = [
  "insufficient_balance",
  "not_owner",
  "invalid_discount_percent",
  "invalid_quantity",
  "package_unavailable",
  "invalid_target",
] as const;

/** Localized copy for each reason, for promotionPurchaseError's `reasons`. */
export function purchaseReasonMessages(
  t: (key: `purchaseErrors.${(typeof PURCHASE_REASONS)[number]}`) => string,
): Record<string, string> {
  return Object.fromEntries(
    PURCHASE_REASONS.map((reason) => [reason, t(`purchaseErrors.${reason}`)]),
  );
}

/**
 * Turn an edge-function invoke failure into a message worth showing a user.
 *
 * `supabase.functions.invoke` resolves three different error shapes, and only two of
 * them carry a `Response`:
 *   - FunctionsHttpError  → context is the non-2xx Response; its body is ours to read.
 *   - FunctionsRelayError → context is a Response too.
 *   - FunctionsFetchError → context is the raw fetch rejection (a TypeError, an
 *     AbortError, or the TimeoutError our own `timeoutFetch` throws). There is no
 *     body, and `error.message` is supabase-js's internal English string
 *     "Failed to send a request to the Edge Function".
 *
 * That last string used to be returned verbatim and rendered in the Georgian payment
 * dialog — the defect a tester reported against the discount-badge purchase. A network
 * failure is not a purchase outcome, so it gets its own localized copy instead of the
 * library's internals.
 */
export async function promotionPurchaseError(
  error: unknown,
  messages: {
    /** Shown for the stable `vip_tier_conflict` outcome (C23). */
    vipConflict: string;
    /** Shown when the request never reached the function at all. */
    network: string;
    /** Shown when the function answered but said nothing we can render. */
    generic: string;
    /**
     * Localized copy per `reason` token (purchase-vip maps the purchase_package
     * HINTs, e.g. insufficient_balance / not_owner). Preferred over the
     * function's Georgian `error` text, which en/ru users cannot read.
     */
    reasons?: Partial<Record<string, string>>;
  },
): Promise<Error> {
  const context = (error as { context?: Response } | null)?.context;

  // No Response means the fetch itself failed: offline, DNS, CORS-blocked, or aborted
  // by the client fetch budget. Nothing was returned to explain, so say that plainly.
  if (!context || typeof context.clone !== "function") {
    return new Error(messages.network);
  }

  try {
    const payload = (await context.clone().json()) as {
      error?: unknown;
      reason?: unknown;
      correlation_id?: unknown;
    };
    if (payload.error === "vip_tier_conflict") {
      return new Error(messages.vipConflict);
    }
    const localized =
      typeof payload.reason === "string"
        ? messages.reasons?.[payload.reason]
        : undefined;
    if (localized) return new Error(localized);
    // Otherwise surface the function's own curated message — e.g. the Georgian
    // insufficient-balance text it authors itself. `correlation_id` is the tell
    // that this is NOT one of those: `errorResponse` in
    // supabase/functions/_shared/guards.ts attaches it only to the catch-all arm
    // that masks an unexpected failure behind the English sentinel "Request
    // could not be completed". Echoing that would put an untranslated string
    // back into a Georgian payment dialog — the very defect this file fixes.
    if (
      payload.correlation_id === undefined &&
      typeof payload.error === "string" &&
      payload.error.trim()
    ) {
      return new Error(payload.error.trim());
    }
  } catch {
    // Body was not JSON, or not ours. Fall through.
  }

  // The function (or the gateway in front of it) answered with something we have no
  // localized wording for — e.g. the platform's own English "Invalid JWT" on an
  // expired session. Better a plain retry prompt than a leaked internal string.
  return new Error(messages.generic);
}
