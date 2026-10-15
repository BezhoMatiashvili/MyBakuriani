/**
 * Time-bounding helpers shared across server, client and edge code.
 *
 * Background: a `try/catch` only catches a *rejection* — it does nothing for a
 * *hang*. `@supabase/ssr` / `supabase-js` call the global `fetch` with no
 * default timeout, so a stalled request never resolves and never rejects, which
 * can freeze a Server Component (and the whole page) on its loading fallback
 * forever. These helpers convert "hang forever" into "settle quickly".
 */

import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";

/**
 * Resolves to `fallback` after `ms` if `p` hasn't settled. Used for graceful
 * degradation: a slow dependency yields a usable fallback instead of blocking
 * the page. Never rejects on timeout, so callers always get a value.
 */
export async function withTimeout<T>(
  p: PromiseLike<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Budget for a listing detail page's *secondary* reads (reviews, calendar,
 * price overrides, applications count). Kept just under the anon role's 3s
 * Postgres `statement_timeout` so a starved secondary query degrades to an
 * empty fallback before the DB cancels it — the core listing still renders.
 */
export const DETAIL_AUX_TIMEOUT_MS = 2500;

/**
 * Returns a `fetch` that aborts after `ms` milliseconds. Wired in as the
 * `global.fetch` for every Supabase client so a stalled HTTP request rejects
 * (letting the surrounding try/catch fall back) instead of hanging forever.
 *
 * Auth requests (`/auth/v1/*` — login, OTP verify, token refresh) get a
 * generous, still-bounded window instead of the aggressive data timeout:
 * aborting them mid-flight surfaces as failed logins (the "press login twice"
 * bug) and dropped refreshes (false logouts). The anti-hang layer exists to
 * stop *data* fetches from freezing the page loader, not to police auth.
 *
 * Uses a manual AbortController rather than `AbortSignal.timeout` so that any
 * caller-provided signal is still honoured (Supabase's auth layer passes one).
 */
const AUTH_FETCH_TIMEOUT_MS = 25_000;

export function timeoutFetch(ms: number): typeof fetch {
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const effectiveMs = url.includes("/auth/v1/")
      ? Math.max(ms, AUTH_FETCH_TIMEOUT_MS)
      : ms;

    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            `fetch timed out after ${effectiveMs}ms`,
            "TimeoutError",
          ),
        ),
      effectiveMs,
    );

    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener(
          "abort",
          () => controller.abort(callerSignal.reason),
          { once: true },
        );
      }
    }

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
    });
  };
}

/**
 * Recognizes a `timeoutFetch` abort surfaced as a postgrest-js `error` (or any
 * error-shaped value), by the exact message it sets above. Lets callers return
 * a distinguishable error code instead of leaking the raw English message to
 * the client.
 */
export function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.includes("fetch timed out after")
  );
}

/**
 * Both auth-js and postgrest-js resolve `{ data, error }` rather than
 * throwing on a network/timeout failure (a `timeoutFetch` abort surfaces as
 * an `error`, not a rejection). A DB-side blip — e.g. lock contention while
 * some other service reconnects — tends to clear within seconds, so retrying
 * once turns "user sees a raw failure" into "the call takes a bit longer".
 *
 * `isRetryable` defaults to "retry on any error", which is correct for calls
 * whose only non-error outcome already means "not found" (e.g. `.maybeSingle()`
 * on a primary key) — there every error is by definition unexpected. Auth
 * calls should instead pass `isRetryableAuthError` (below) so a real
 * "wrong password" isn't retried.
 */
export async function withRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  isRetryable: (error: NonNullable<T["error"]>) => boolean = () => true,
): Promise<T> {
  const first = await run();
  if (!first.error || !isRetryable(first.error as NonNullable<T["error"]>)) {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return run();
}

/**
 * For `withRetry` around a lookup whose failure only costs a detail. Retries a
 * failure that comes back FAST and may clear within a moment: no response at all
 * (a network failure or a gateway page; postgrest-js gives those no `code`), the
 * connection (08), serialization/deadlock (40), resource (53) and
 * shutdown/startup (57P01-57P03) SQLSTATEs, and PostgREST's own connection
 * errors (PGRST000-002).
 *
 * Never a SLOW failure: a `timeoutFetch` abort (it carries no `code` either), a
 * statement timeout (57014) or a pool wait (PGRST003) has already spent the
 * request budget (9.5 s on the server, kept under a 10 s cap), so a second try
 * would double it. Never a definitive answer (a missing function, a denied or
 * malformed request) either: it fails the same way again.
 */
export function isRetryableDbError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  if (isTimeoutError(error)) return false;
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "57014" || code === "PGRST003") return false;
  return code === "" || /^(?:08|40|53|57|PGRST00[0-2])/.test(code);
}

/**
 * `isAuthRetryableFetchError` only recognizes a fetch-level failure (network
 * death, our own `timeoutFetch` abort) or a 502/503/504 response — it misses
 * a plain 500, which is exactly what GoTrue returns when its own DB query is
 * starved (seen directly in this project's auth logs as "500: ... context
 * deadline exceeded"). Any 5xx is a server-side failure worth one retry; a
 * 4xx (wrong password, rate limit, malformed request) is definitive and must
 * not be retried.
 */
export function isRetryableAuthError(error: unknown): boolean {
  return (
    isAuthRetryableFetchError(error) ||
    (isAuthApiError(error) && error.status >= 500)
  );
}

/**
 * A refresh-token rotation has exactly one winner. When the browser client's
 * own auto-refresh tick and a server-side reactive refresh race inside the
 * expiry margin, the loser gets a 400 with one of these codes — byte-identical
 * to a real sign-out at the auth layer, but NOT one. Booting on it is a false
 * logout ("I am logged in, I click a category to post a listing, and it throws
 * me back to Log In").
 */
const ROTATION_LOSER_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

/**
 * The single "couldn't tell whether this session is valid" predicate, shared by
 * the middleware gate and `getCurrentUser`.
 *
 * It lives HERE, next to `isRetryableAuthError`, rather than in
 * `src/lib/supabase/middleware.ts`, because `current-user.ts` runs in the RSC
 * path and must not pull a `next/server`-importing module into it.
 *
 * Keeping the two gates on one predicate is the point: the middleware
 * deliberately lets a transient failure through instead of falsely logging the
 * user out, and the server layouts behind it (`create/layout.tsx`,
 * `dashboard/layout.tsx`) must agree about what "transient" means — otherwise
 * the middleware waves the request through and the layout boots it anyway,
 * which is exactly the asymmetry this replaced.
 */
export function isTransientAuthFailure(error: unknown): boolean {
  // Fetch-level failure, our own timeout abort, or any 5xx (incl. the plain
  // GoTrue 500 that isAuthRetryableFetchError misses).
  if (isRetryableAuthError(error)) return true;
  if (!isAuthApiError(error)) return false;
  // 429: the hosted per-address limiter refused the refresh. It says "try
  // again later", nothing about the session (see `refusalAwareFetch`).
  if (error.status === 429) return true;
  return (
    error.status === 400 &&
    typeof error.code === "string" &&
    ROTATION_LOSER_CODES.has(error.code)
  );
}

/**
 * Hosted Auth limits `/auth/v1/token` per source address, and every server-side
 * refresh (middleware and server render) leaves from the app's one egress
 * address, so a burst of requests carrying an expired cookie can empty the
 * bucket for everyone. auth-js reads a refused refresh as a sign-out
 * (`_removeSession`) and asks the cookie adapter to empty the auth cookie, so a
 * drained bucket would delete returning users' sessions.
 *
 * This wrapper (a) remembers that a refresh was refused, so the cookie adapter
 * can keep the browser's cookie (`dropsDeletion`), and (b) makes sure the
 * refusal always reaches auth-js as its JSON `AuthApiError` 429, which
 * `isTransientAuthFailure` recognizes: a gateway's plain-text 429 would become
 * a status-less `AuthUnknownError`. Every other response passes through as it
 * came, so nothing changes while Auth answers normally.
 */
export function refusalAwareFetch(base: typeof fetch): {
  fetch: typeof fetch;
  dropsDeletion: (cookies: { value: string }[]) => boolean;
} {
  let refused = false;
  return {
    fetch: async (input, init) => {
      const res = await base(input, init);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (res.status !== 429 || !url.includes("/auth/v1/token")) return res;
      refused = true;
      if ((res.headers.get("content-type") ?? "").includes("json")) return res;
      return new Response(
        JSON.stringify({
          code: 429,
          error_code: "over_request_rate_limit",
          msg: "Request rate limit reached",
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    },
    // The batch auth-js hands the cookie adapter after a refused refresh only
    // empties cookies; the browser keeps its own and tries again later.
    dropsDeletion: (cookies) =>
      refused && cookies.length > 0 && cookies.every((c) => c.value === ""),
  };
}
