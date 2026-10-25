import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hashSmsOptOutToken } from "@/lib/sms/opt-out";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

// The guest's win-back opt-out link (owner's technical task 2026-10-25, C18). GET says
// whether this host's offers to the number are still on; only POST withdraws them, so a
// link preview or scanner that fetches the page opts nobody out.

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function invalidToken() {
  return Response.json(
    { error: "invalid_token" },
    { status: 404, headers: noStoreHeaders },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (
    !(await checkRateLimit(`sms-stop-read:${getClientIp(request)}`, 60, 60_000))
  ) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStoreHeaders },
    );
  }
  const tokenHash = hashSmsOptOutToken(token);
  if (!tokenHash) return invalidToken();
  try {
    const { data, error } = await createServiceClient().rpc(
      "sms_optout_token_details",
      { p_token_hash: tokenHash },
    );
    if (error) throw error;
    const details = data as {
      status?: string;
      property_title?: string | null;
    } | null;
    if (!details) return invalidToken();
    return Response.json(
      {
        optOut: {
          status: details.status === "active" ? "active" : "withdrawn",
          propertyTitle: details.property_title ?? null,
        },
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (
    !(await checkRateLimit(
      `sms-stop-write:${getClientIp(request)}`,
      15,
      60 * 60_000,
    ))
  ) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: noStoreHeaders },
    );
  }
  const tokenHash = hashSmsOptOutToken(token);
  if (!tokenHash) return invalidToken();
  try {
    const { data, error } = await createServiceClient().rpc(
      "sms_optout_by_token",
      { p_token_hash: tokenHash },
    );
    if (error) {
      if (error.code === "P0002" || error.code === "22023") {
        return invalidToken();
      }
      throw error;
    }
    const result = data as { status?: string } | null;
    return Response.json(
      {
        optOut: {
          status: result?.status === "withdrawn" ? "withdrawn" : "already",
        },
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
