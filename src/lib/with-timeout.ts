/**
 * Time-bounding helpers shared across server, client and edge code.
 *
 * Background: a `try/catch` only catches a *rejection* — it does nothing for a
 * *hang*. `@supabase/ssr` / `supabase-js` call the global `fetch` with no
 * default timeout, so a stalled request never resolves and never rejects, which
 * can freeze a Server Component (and the whole page) on its loading fallback
 * forever. These helpers convert "hang forever" into "settle quickly".
 */

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
 * Returns a `fetch` that aborts after `ms` milliseconds. Wired in as the
 * `global.fetch` for every Supabase client so a stalled HTTP request rejects
 * (letting the surrounding try/catch fall back) instead of hanging forever.
 *
 * Uses a manual AbortController rather than `AbortSignal.timeout` so that any
 * caller-provided signal is still honoured (Supabase's auth layer passes one).
 */
export function timeoutFetch(ms: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(`fetch timed out after ${ms}ms`, "TimeoutError"),
        ),
      ms,
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
