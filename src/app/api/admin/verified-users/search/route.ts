import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { applyOps, json } from "@/lib/admin-statuses-server";
import {
  USER_SEARCH_LIMIT,
  USER_SEARCH_MIN_CHARS,
  normalizeSearchTerm,
} from "@/lib/user-groups";
import {
  PICKER_COLUMNS,
  dbFailure,
  toPickerUser,
  userSearchOps,
} from "@/lib/user-groups-server";

// The user picker's search over every profile, verified or not (C52).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const term = normalizeSearchTerm(req.nextUrl.searchParams.get("q"));
  if (Array.from(term).length < USER_SEARCH_MIN_CHARS) {
    return json({ results: [] });
  }

  const { data, error, status } = await applyOps(
    createServiceClient().from("profiles").select(PICKER_COLUMNS),
    userSearchOps(term),
  )
    .order("display_name")
    .order("id")
    .limit(USER_SEARCH_LIMIT);
  if (error) return dbFailure(error, "user search", status);
  return json({ results: (data ?? []).map(toPickerUser) });
}
