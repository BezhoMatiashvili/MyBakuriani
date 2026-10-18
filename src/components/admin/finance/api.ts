"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Client side of the finance API (C42): every route answers {error: code} on
// failure, and AdminFinances.errors.<code> words it.

export type ApiFailure = { code: string; status: number };
export type ApiResult<T> =
  { ok: true; data: T; status: number } | { ok: false; error: ApiFailure };

const TIMEOUT_MS = 30_000;

export async function financeRequest<T>(
  url: string,
  {
    method = "GET",
    json,
    body,
  }: { method?: string; json?: unknown; body?: FormData } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers:
        json === undefined ? undefined : { "Content-Type": "application/json" },
      body: json === undefined ? body : JSON.stringify(json),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: { code: "network", status: 0 } };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      payload && typeof payload.error === "string" ? payload.error : "generic";
    return { ok: false, error: { code, status: response.status } };
  }
  return { ok: true, data: payload as T, status: response.status };
}

/** A finance API error code in words (falls back to a generic message). */
export function useErrorText() {
  const t = useTranslations("AdminFinances");
  return useCallback(
    (code: string) =>
      t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"),
    [t],
  );
}

/** GET `url` (null = nothing to load); the latest request wins. */
export function useFinanceQuery<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    void financeRequest<T>(url).then((result) => {
      if (id !== latest.current) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
  }, [url, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, reload };
}

/**
 * Downloads a finance export or PDF through fetch, so a refusal (rate limit,
 * expired session) is shown as a message instead of saved as a file.
 */
export async function downloadFile(url: string): Promise<ApiFailure | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { code: "network", status: 0 };
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    return {
      code: typeof payload?.error === "string" ? payload.error : "generic",
      status: response.status,
    };
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "mybakuriani";
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return null;
}
