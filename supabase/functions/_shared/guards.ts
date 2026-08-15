import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Reflect only an exact origin listed in ALLOWED_ORIGINS (comma-separated).
// Preview deployments must be added explicitly by CI; suffix matching lets an
// attacker-controlled or misconfigured Vercel host become a trusted origin.
//
// Note: these endpoints rely on Bearer tokens, not cookies, so CORS is a
// defense-in-depth measure against browser-driven token abuse rather than the
// primary auth boundary. The fallback is the production origin (not "*") so
// a missing env never silently opens CORS to the world.
function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("APP_ORIGIN");
  const configured = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // The production Edge Function also backs local development. These exact
  // loopback origins are safe to expose because callers still need the same
  // Bearer credentials as any other request and no cookies are involved.
  return [
    ...configured,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ];
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!allowed.includes(origin)) return false;
  if (origin.startsWith("https://")) return true;

  // Permit an explicitly configured loopback origin for local development.
  // Plain HTTP remains forbidden for every non-loopback host.
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;
  if (isAllowedOrigin(requestOrigin, allowed)) {
    allowOrigin = requestOrigin;
  } else if (allowed.length > 0) {
    allowOrigin = allowed[0];
  }

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Legacy export — public endpoints that still use it receive the canonical
// production origin, never a wildcard. New functions must call buildCorsHeaders.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const edgeBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_EDGE_BUCKETS = 5_000;

function localEdgeLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (edgeBuckets.size >= MAX_EDGE_BUCKETS) {
    for (const [bucketKey, bucket] of edgeBuckets) {
      if (bucket.resetAt < now) edgeBuckets.delete(bucketKey);
    }
    while (edgeBuckets.size >= MAX_EDGE_BUCKETS) {
      const oldestKey = edgeBuckets.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      edgeBuckets.delete(oldestKey);
    }
  }
  const bucket = edgeBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    edgeBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/**
 * Shared limiter for Edge functions. The store is Postgres (consume_rate_limit);
 * Upstash is used instead when both of its env vars are present.
 *
 * This MUST NOT fail closed on an unconfigured store. It falls back to a
 * bounded per-isolate bucket, and the Deno half is the
 * reason that rule needs writing down twice: it previously returned false
 * whenever DENO_DEPLOYMENT_ID was set and Upstash was absent — which is every
 * deployed function — so the public /search page 429'd in production from
 * 9828eba until 2026-07-25. It went unnoticed because the search page reaches
 * this function by raw fetch rather than functions.invoke, so a "no invoke
 * caller" grep wrongly read it as dead. Mirrors src/lib/rateLimit.ts (C16).
 */
export async function checkRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const forwarded =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${scope}:${forwarded}`;
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL")?.replace(/\/$/, "");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) {
    try {
      const response = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["PEXPIRE", key, String(windowMs), "NX"],
        ]),
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        const result = (await response.json()) as Array<{ result?: unknown }>;
        const count = Number(result[0]?.result);
        if (Number.isFinite(count)) return count <= limit;
      }
    } catch {
      /* fall through to Postgres */
    }
  }
  try {
    const { data, error } = await createServiceClient().rpc(
      "consume_rate_limit",
      {
        p_key: key,
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      },
    );
    if (!error && typeof data === "boolean") return data;
  } catch {
    /* fall through to the local bucket / fail open */
  }
  console.warn(
    `[guards] no shared rate-limit store reachable; using local fallback for "${key}"`,
  );
  return localEdgeLimit(key, limit, windowMs);
}

type ErrorCode =
  | "AUTH_HEADER_MISSING"
  | "AUTH_HEADER_INVALID"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_UNAUTHORIZED"
  | "ENV_MISSING"
  | "ENV_INVALID"
  | "BAD_REQUEST"
  | "SUBSCRIPTION_TIER_LOCKED";

export class ApiError extends Error {
  status: number;
  code: ErrorCode;

  constructor(message: string, status = 400, code: ErrorCode = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = corsHeaders,
): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...extraHeaders, "Content-Type": "application/json" },
    status,
  });
}

export function errorResponse(
  error: unknown,
  extraHeaders: Record<string, string> = corsHeaders,
): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
      extraHeaders,
    );
  }

  const correlationId = crypto.randomUUID();
  // Do not serialize database/provider exception strings to callers. They are
  // useful in logs but frequently disclose schema, policy, or token details.
  console.error(JSON.stringify({ correlationId, error: String(error) }));
  return jsonResponse(
    {
      error: "Request could not be completed",
      code: "BAD_REQUEST" satisfies ErrorCode,
      correlation_id: correlationId,
    },
    500,
    extraHeaders,
  );
}

function requireEnv(
  name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY",
): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new ApiError(
      `Missing required environment variable: ${name}`,
      500,
      "ENV_MISSING",
    );
  }

  return value;
}

export function createServiceClient() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function getBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new ApiError(
      "Authorization header is required",
      401,
      "AUTH_HEADER_MISSING",
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    throw new ApiError(
      "Authorization header must be in Bearer format",
      401,
      "AUTH_HEADER_INVALID",
    );
  }

  return token;
}

export async function requireUser(
  req: Request,
  supabase = createServiceClient(),
) {
  const token = getBearerToken(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error) {
    throw new ApiError("Invalid or expired token", 401, "AUTH_INVALID_TOKEN");
  }

  if (!user) {
    throw new ApiError("Unauthorized", 401, "AUTH_UNAUTHORIZED");
  }

  return { supabase, user };
}
