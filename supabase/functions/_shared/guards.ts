import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Reflect the request origin only if it is in the allowlist (ALLOWED_ORIGINS
// env var, comma-separated) or is a deployment URL of our own Vercel team,
// else fall back to the first configured origin (or the hardcoded production
// origin if none configured).
//
// Note: these endpoints rely on Bearer tokens, not cookies, so CORS is a
// defense-in-depth measure against browser-driven token abuse rather than the
// primary auth boundary. The fallback is the production origin (not "*") so
// a missing env never silently opens CORS to the world.
const PRODUCTION_ORIGIN = "https://mybakuriani.ge";

// Vercel deployment/preview URLs look like
// https://<project>-<hash>-bezhomatiashvilis-projects.vercel.app and the hash
// changes per deploy, so they can't be exact-listed. Only this Vercel team can
// mint hosts with this suffix, so reflecting them is safe.
const VERCEL_TEAM_SUFFIX = "-bezhomatiashvilis-projects.vercel.app";

function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("APP_ORIGIN");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin.startsWith("https://")) return false;
  if (allowed.includes(origin)) return true;
  return origin.endsWith(VERCEL_TEAM_SUFFIX);
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const requestOrigin = req.headers.get("origin") ?? "";

  let allowOrigin: string;
  if (isAllowedOrigin(requestOrigin, allowed)) {
    allowOrigin = requestOrigin;
  } else if (allowed.length > 0) {
    allowOrigin = allowed[0];
  } else {
    allowOrigin = PRODUCTION_ORIGIN;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Legacy export — kept so older function files keep compiling until migrated.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ErrorCode =
  | "AUTH_HEADER_MISSING"
  | "AUTH_HEADER_INVALID"
  | "AUTH_INVALID_TOKEN"
  | "AUTH_UNAUTHORIZED"
  | "ENV_MISSING"
  | "BAD_REQUEST";

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

  const message =
    error instanceof Error ? error.message : "Internal server error";
  return jsonResponse(
    { error: message, code: "BAD_REQUEST" satisfies ErrorCode },
    400,
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
