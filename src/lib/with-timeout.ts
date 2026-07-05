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
