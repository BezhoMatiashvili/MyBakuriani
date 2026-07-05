/**
 * Best-effort per-IP rate limiting for cheap, unauthenticated public routes
 * (geocode proxy, view-tracking endpoints). In-memory only — no Redis/Upstash
 * is wired into this deployment, and a serverless instance's warm lifetime is
 * enough to blunt a single client hammering an endpoint, even though it can't
 * coordinate across instances/regions. Reach for a shared store (Upstash
 * Ratelimit, etc.) if this ever needs to be airtight.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Cheap bound on unbounded growth from IP-spoofing/scanning traffic — sweep
// expired entries once the map gets large rather than tracking a timer.
const MAX_BUCKETS = 5000;

function sweep(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

/** Returns true if the call is allowed, false if the caller is over `limit` requests per `windowMs`. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Best-effort client IP from Vercel/standard proxy headers; falls back to a shared bucket if absent. */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
