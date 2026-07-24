import { getCurrentUser } from "@/lib/auth/current-user";
import {
  CLEANER_PROFILE_FIELDS,
  hasOnlyReviewableValues,
  REVIEWABLE_FIELDS,
  type ContentChangeTarget,
} from "@/lib/content-change/fields";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ChangeRow = Record<string, unknown>;

function isTarget(value: unknown): value is ContentChangeTarget {
  return (
    value === "profile" ||
    value === "property" ||
    value === "service" ||
    value === "organization"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pick(source: ChangeRow, fields: readonly string[]) {
  return Object.fromEntries(
    fields.map((field) => [field, source[field] ?? null]),
  );
}

/**
 * Key-order-independent serialization. Postgres normalises jsonb key order while the
 * create forms rebuild objects like `house_rules` as fresh literals, so a plain
 * JSON.stringify comparison reported a phantom diff on every property edit — which
 * queued a no-op request and consumed the one-pending-per-target slot.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : val,
  );
}

function difference(before: ChangeRow, proposed: ChangeRow) {
  const diff: ChangeRow = {};
  for (const [field, after] of Object.entries(proposed)) {
    const was = before[field];
    if (canonical(was) !== canonical(after))
      diff[field] = { before: was ?? null, after };
  }
  return diff;
}

async function canEditTarget(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
  target: ContentChangeTarget,
  targetId: string,
) {
  if (target === "profile") {
    if (targetId !== userId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from("profiles")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    return (data as ChangeRow | null) ?? null;
  }
  const table =
    target === "property"
      ? "properties"
      : target === "service"
        ? "services"
        : "organizations";
  // Service client is deliberate: authorization is checked below and avoids
  // dashboard RLS visibility differences for approved organization members.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from(table)
    .select("*")
    .eq("id", targetId)
    .maybeSingle();
  if (!data) return null;
  if (data.owner_id === userId) return data as ChangeRow;
  if (target === "property" && data.organization_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: membership } = await (db as any)
      .from("organization_members")
      .select("id")
      .eq("organization_id", data.organization_id)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membership) return data as ChangeRow;
  }
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("content_change_requests")
    .select("*")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    targetType?: unknown;
    targetId?: unknown;
    proposedValues?: unknown;
  } | null;
  if (
    !body ||
    !isTarget(body.targetType) ||
    typeof body.targetId !== "string" ||
    !isObject(body.proposedValues)
  ) {
    return Response.json(
      { error: "targetType, targetId and proposedValues are required" },
      { status: 400 },
    );
  }
  const publicValues = Object.fromEntries(
    Object.entries(body.proposedValues).filter(
      ([key]) => key !== "cleaner_profile",
    ),
  );
  if (
    !hasOnlyReviewableValues(body.targetType, publicValues) ||
    ("cleaner_profile" in body.proposedValues && body.targetType !== "profile")
  ) {
    return Response.json({ error: "non_reviewable_field" }, { status: 400 });
  }

  const db = createServiceClient();
  const target = await canEditTarget(
    db,
    user.id,
    body.targetType,
    body.targetId,
  );
  if (!target)
    return Response.json({ error: "forbidden_or_not_found" }, { status: 404 });

  let proposed: ChangeRow = { ...body.proposedValues };
  let before = pick(target, REVIEWABLE_FIELDS[body.targetType]);
  if (
    body.targetType === "profile" &&
    isObject(body.proposedValues.cleaner_profile)
  ) {
    const cleaner = body.proposedValues.cleaner_profile;
    if (
      !Object.keys(cleaner).every((key) =>
        (CLEANER_PROFILE_FIELDS as readonly string[]).includes(key),
      )
    ) {
      return Response.json(
        { error: "non_reviewable_cleaner_field" },
        { status: 400 },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentCleaner } = await (db as any)
      .from("cleaner_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    before = {
      ...before,
      cleaner_profile: pick(
        (currentCleaner ?? {}) as ChangeRow,
        CLEANER_PROFILE_FIELDS,
      ),
    };
    proposed = { ...proposed, cleaner_profile: cleaner };
  }
  const selectedBefore = Object.fromEntries(
    Object.keys(proposed).map((key) => [key, before[key] ?? null]),
  );
  const fieldDiff = difference(selectedBefore, proposed);
  if (Object.keys(fieldDiff).length === 0)
    return Response.json({ error: "no_changes" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("content_change_requests")
    .insert({
      requester_id: user.id,
      target_type: body.targetType,
      target_id: body.targetId,
      before_snapshot: selectedBefore,
      proposed_values: proposed,
      field_diff: fieldDiff,
    })
    .select("id, status, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      // content_change_one_pending_target permits one pending request per TARGET, so a
      // second edit would otherwise lock the owner (and every org co-member) out of
      // their own listing until an admin acts — there is no withdraw UI. Replace the
      // pending proposal instead: canEditTarget has already authorized this submitter
      // for this target, and the newest proposal is the one they want reviewed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: replaced, error: replaceError } = await (db as any)
        .from("content_change_requests")
        .update({
          requester_id: user.id,
          before_snapshot: selectedBefore,
          proposed_values: proposed,
          field_diff: fieldDiff,
        })
        .eq("target_type", body.targetType)
        .eq("target_id", body.targetId)
        .eq("status", "pending")
        .select("id, status, created_at")
        .maybeSingle();
      if (replaceError || !replaced) {
        return Response.json({ error: "target_locked" }, { status: 409 });
      }
      return Response.json({ request: replaced }, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ request: data }, { status: 201 });
}
