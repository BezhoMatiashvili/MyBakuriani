import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VISITOR_COOKIE = "mb_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type Body = { path?: string | null };

// Records a single page view for first-party visit analytics. Anonymous visitors
// are tracked via a long-lived `mb_vid` cookie; logged-in users are additionally
// stamped with their id. Fire-and-forget — always returns ok, never blocks the UI.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 512) : null;

  const jar = await cookies();
  const existingVid = jar.get(VISITOR_COOKIE)?.value;
  const visitorId = existingVid ?? crypto.randomUUID();

  // Resolve the logged-in user (if any) so we can count registered visitors.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Unauthenticated / transient auth error — treat as anonymous.
  }

  try {
    // page_views is created in migration 20260609120000_page_views.sql and is
    // not yet in the generated DB types; cast through unknown (same pattern as
    // the admin stats route) until types are regenerated.
    const db = createServiceClient() as unknown as {
      from: (table: "page_views") => {
        insert: (row: {
          visitor_id: string;
          user_id: string | null;
          path: string | null;
        }) => Promise<unknown>;
      };
    };
    await db
      .from("page_views")
      .insert({ visitor_id: visitorId, user_id: userId, path });
  } catch {
    // Never surface tracking failures to the client.
  }

  const res = Response.json({ ok: true });
  if (!existingVid) {
    res.headers.append(
      "Set-Cookie",
      `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`,
    );
  }
  return res;
}
