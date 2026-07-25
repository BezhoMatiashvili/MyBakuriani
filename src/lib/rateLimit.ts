/**
 * Distributed, fixed-window rate limiting.
 *
 * The shared store is the app's own Postgres (`consume_rate_limit`), so the
 * limiter works out of the box with no third-party account to provision.
 * Upstash is still honoured when both of its env vars are present, so it can be
 * adopted later without a code change.
 *
 * HISTORY — read this before "simplifying" the fallback chain. This module used
 * to be Upstash-only and returned false whenever no shared store was configured
 * in production. Upstash was never provisioned, so from 9828eba (2026-07-24)
 * until the Postgres limiter landed, EVERY rate-limited route 429'd in
 * production: phone reveal, geocode, photo-upload intents, job applications,
 * the view beacon and the analytics beacons were all dead. Only
 * /api/banner-slots/track survived, via an explicit "skip the limit when
 * unconfigured" guard. Never reintroduce a state where unconfigured means deny.
 *
 * Server-only: this imports the service-role Supabase client. Never import it
 * from a client component.
 */
import { createServiceClient } from "@/lib/supabase/admin";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

function localLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(bucketKey);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** null = store unreachable (the caller decides); a boolean is a real verdict. */
async function upstashLimit(
  config: { url: string; token: string },
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs), "NX"],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(result[0]?.result);
    return Number.isFinite(count) ? count <= limit : null;
  } catch {
    return null;
  }
}

/**
 * Budget for the limiter's own round-trip, matching Upstash's.
 *
 * The service client's fetch timeout is 9.5s and service_role inherits an 8s
 * statement_timeout, so without a bound of our own a stalled connection would
 * sit here for ~8-9.5s before the fail-open branch is even reached — nearly the
 * whole serverless budget, spent deciding whether to allow a request we are
 * going to allow anyway. Losing the race means "unreachable", i.e. allow.
 */
const STORE_TIMEOUT_MS = 1_500;

/** null = store unreachable (the caller decides); a boolean is a real verdict. */
async function postgresLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  try {
    const db = createServiceClient();
    // The RPC takes whole seconds, and rejects anything under 1 as invalid, so
    // round a sub-second window up rather than letting it be denied outright.
    const call = db.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
    // The losing request is abandoned, not cancelled — the bucket may still be
    // incremented server-side. Over-counting a slow request is the safe error.
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), STORE_TIMEOUT_MS).unref?.(),
    );
    const result = await Promise.race([call, timeout]);
    if (!result) return null;
    const { data, error } = result;
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Returns true when the call is within its budget.
 *
 * Fails OPEN when no store can be reached, deliberately. These limiters sit in
 * front of endpoints that each enforce their own authorization (RLS, ownership
 * checks, service-role RPC constraints) — the limit is abuse mitigation, not an
 * access control. Making a store round-trip a hard dependency of photo upload
 * and job applications is how a transient outage becomes "sellers cannot list",
 * which is precisely the failure this module already caused once. The
 * unreachable case is logged so it cannot pass unnoticed.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const upstash = redisConfig();
  if (upstash) {
    const verdict = await upstashLimit(upstash, key, limit, windowMs);
    if (verdict !== null) return verdict;
  }

  const verdict = await postgresLimit(key, limit, windowMs);
  if (verdict !== null) return verdict;

  if (process.env.NODE_ENV !== "production") {
    return localLimit(key, limit, windowMs);
  }
  console.warn(`[rateLimit] no shared store reachable; allowing "${key}"`);
  return true;
}

/**
 * Client address from the trusted deployment proxy; never accept user input.
 *
 * Load-bearing: some limits are keyed on this value ALONE, so a deployment that
 * does not overwrite x-forwarded-for at the edge would let a caller mint its own
 * bucket per request. Vercel overwrites it; re-check before hosting elsewhere.
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
