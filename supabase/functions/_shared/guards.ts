import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
    );
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  return jsonResponse(
    { error: message, code: "BAD_REQUEST" satisfies ErrorCode },
    400,
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
