import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { json } from "@/lib/admin-statuses-server";
import {
  parseGroupInput,
  type UserGroupRow,
  type UserGroupsPayload,
} from "@/lib/user-groups";
import {
  byName,
  dbFailure,
  errorResponse,
  toPickerUser,
} from "@/lib/user-groups-server";

// Groups: every group with its payer and members (GET), create (POST) (C52).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Literal, so supabase-js infers the row type. The FK hint keeps `profile`
// unambiguous if the members table ever gets a second link to profiles.
const GROUP_SELECT =
  "id, name, note, created_by, created_at, updated_at, members:user_group_members(user_id, role, created_at, profile:profiles!user_group_members_user_id_fkey(id, display_name, phone, avatar_url, role, is_verified, created_at))";

// Groups per request. Embedded members are not capped by PostgREST's
// max-rows, so a page of groups can be wide; 200 keeps it bounded.
const GROUP_PAGE = 200;

function readGroups(db: ReturnType<typeof createServiceClient>, from: number) {
  return (
    db
      .from("user_groups")
      .select(GROUP_SELECT, { count: "exact" })
      // An immutable key, so an edit made while paging cannot move a group
      // across a page boundary; updated_at is sorted below.
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + GROUP_PAGE - 1)
  );
}
type GroupRaw = NonNullable<
  Awaited<ReturnType<typeof readGroups>>["data"]
>[number];

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();

  // Advance by what was fetched and stop on the count, not on a short page: a
  // server-side max-rows below GROUP_PAGE would otherwise end the loop early
  // (a silent truncation). Keyed by id: a group created while paging shifts
  // the next page by one and would repeat a row.
  const byId = new Map<string, GroupRaw>();
  let fetched = 0;
  for (;;) {
    const page = await readGroups(db, fetched);
    // The table shrank while paging: what is already read is the list.
    if (page.error?.code === "PGRST103") break;
    if (page.error) return dbFailure(page.error, "groups list", page.status);
    for (const group of page.data ?? []) byId.set(group.id, group);
    fetched += page.data?.length ?? 0;
    if (!page.data?.length || fetched >= (page.count ?? 0)) break;
  }

  const groups: UserGroupRow[] = [...byId.values()]
    .map((group) => {
      // Rows of one save share created_at (one transaction), so the name
      // breaks the tie: the order is "when added", then alphabetical. A member
      // whose profile came back null is dropped, not thrown on (one bad row
      // must not blank the whole list).
      const people = group.members
        .filter((member) => member.profile)
        .sort(
          (a, b) =>
            Date.parse(a.created_at) - Date.parse(b.created_at) ||
            byName(a.profile, b.profile),
        );
      const payer = people.find((member) => member.role === "payer");
      return {
        id: group.id,
        name: group.name,
        note: group.note ?? null,
        created_at: group.created_at,
        updated_at: group.updated_at,
        created_by: group.created_by ?? null,
        payer: payer ? toPickerUser(payer.profile) : null,
        members: people
          .filter((member) => member !== payer)
          .map((member) => toPickerUser(member.profile)),
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
        (a.id < b.id ? -1 : 1),
    );

  const payload: UserGroupsPayload = { groups, count: groups.length };
  return json(payload);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = parseGroupInput(await req.json().catch(() => null));
  if (!parsed.ok) return errorResponse(parsed.error);
  const { name, note, payerId, memberIds } = parsed.value;

  // The admin id is the session's, never the body's.
  const db = createServiceClient(guard.admin.userId);
  const { data, error, status } = await db.rpc("admin_save_user_group", {
    p_admin_id: guard.admin.userId,
    p_name: name,
    p_note: note,
    p_payer_id: payerId,
    p_member_ids: memberIds,
  });
  if (error) return dbFailure(error, "group create", status);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return dbFailure({ message: "no id returned" }, "group create");
  return json({ id }, 201);
}
