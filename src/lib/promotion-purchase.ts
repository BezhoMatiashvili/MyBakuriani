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
      correlation_id?: unknown;
    };
    if (payload.error === "vip_tier_conflict") {
      return new Error(messages.vipConflict);
    }
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
