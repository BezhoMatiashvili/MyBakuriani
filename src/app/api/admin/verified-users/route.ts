import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { applyOps, json, readPage } from "@/lib/admin-statuses-server";
import {
  VERIFIED_USERS_PAGE_SIZE,
  normalizeSearchTerm,
  type UserGroupMembership,
  type UserGroupRole,
  type VerifiedUsersPayload,
} from "@/lib/user-groups";
import { dbFailure, pageRange, userSearchOps } from "@/lib/user-groups-server";

// Verified accounts (profiles.is_verified = true) with the groups each one is
// in (C52). The list is the page's rows; `total` is every verified account,
// `count` the ones matching the search.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_COLUMNS =
  "id, display_name, phone, avatar_url, role, verified_at, created_at";

const asRole = (value: string): UserGroupRole =>
  value === "payer" ? "payer" : "member";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const page = readPage(params);
  const [from, to] = pageRange(page);
  const ops = userSearchOps(normalizeSearchTerm(params.get("q")));
  const db = createServiceClient();

  const [list, all] = await Promise.all([
    applyOps(
      db
        .from("profiles")
        .select(USER_COLUMNS, { count: "exact" })
        .eq("is_verified", true),
      ops,
    )
      .order("verified_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to),
    // Without a search `count` already is the total.
    ops.length > 0
      ? db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_verified", true)
      : null,
  ]);

  let rows = list.data ?? [];
  let count = list.count ?? 0;
  if (list.error?.code === "PGRST103") {
    // A page past the last one (a bookmarked ?page=, or the last row of the
    // last page was just unverified): PostgREST answers 416 only because a
    // count was asked for. Serve an empty page with the real count.
    const head = await applyOps(
      db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_verified", true),
      ops,
    );
    if (head.error) return dbFailure(head.error, "users count", head.status);
    rows = [];
    count = head.count ?? 0;
  } else if (list.error) {
    return dbFailure(list.error, "users list", list.status);
  }
  if (all?.error) return dbFailure(all.error, "users total", all.status);

  // The groups of this page's users: one query, chips ordered by group name.
  const groups = new Map<string, UserGroupMembership[]>();
  if (rows.length > 0) {
    // A top-level query is capped at PostgREST's max-rows (1000) without any
    // error: page on the count so a payer in very many groups is not cut.
    const ids = rows.map((row) => row.id);
    const memberships: {
      user_id: string;
      role: string;
      group: { id: string; name: string } | null;
    }[] = [];
    for (;;) {
      const batch = await db
        .from("user_group_members")
        .select("user_id, role, group:user_groups(id, name)", {
          count: "exact",
        })
        .in("user_id", ids)
        .order("user_id")
        .order("group_id")
        .range(memberships.length, memberships.length + 999);
      if (batch.error?.code === "PGRST103") break;
      if (batch.error) {
        return dbFailure(batch.error, "users groups", batch.status);
      }
      memberships.push(...(batch.data ?? []));
      if (!batch.data?.length || memberships.length >= (batch.count ?? 0)) {
        break;
      }
    }
    for (const m of memberships) {
      if (!m.group) continue;
      const chips = groups.get(m.user_id) ?? [];
      chips.push({
        group_id: m.group.id,
        group_name: m.group.name,
        role: asRole(m.role),
      });
      groups.set(m.user_id, chips);
    }
    for (const chips of groups.values()) {
      chips.sort(
        (a, b) =>
          a.group_name.localeCompare(b.group_name, "ka") ||
          (a.group_id < b.group_id ? -1 : 1),
      );
    }
  }

  const payload: VerifiedUsersPayload = {
    rows: rows.map((row) => ({
      id: row.id,
      display_name: row.display_name,
      phone: row.phone ?? null,
      avatar_url: row.avatar_url ?? null,
      role: row.role,
      verified_at: row.verified_at ?? null,
      created_at: row.created_at ?? null,
      groups: groups.get(row.id) ?? [],
    })),
    count,
    total: all ? (all.count ?? 0) : count,
    page,
    pageSize: VERIFIED_USERS_PAGE_SIZE,
  };
  return json(payload);
}
