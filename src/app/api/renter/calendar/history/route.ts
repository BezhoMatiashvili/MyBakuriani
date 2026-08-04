import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/uuid";

export const runtime = "nodejs";

const PAGE_SIZE = 30;
const TIMESTAMPTZ_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

type AuditSnapshot = Record<string, unknown> | null;

function encodeCursor(occurredAt: string, id: string) {
  return Buffer.from(JSON.stringify([occurredAt, id])).toString("base64url");
}

function decodeCursor(raw: string | null): [string, string] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== "string" ||
      !TIMESTAMPTZ_RE.test(value[0]) ||
      Number.isNaN(Date.parse(value[0])) ||
      typeof value[1] !== "string" ||
      !isUuid(value[1])
    ) {
      return null;
    }
    return [value[0], value[1]];
  } catch {
    return null;
  }
}

function textValue(snapshot: AuditSnapshot, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : null;
}

function eventType(
  operation: string,
  oldValues: AuditSnapshot,
  newValues: AuditSnapshot,
) {
  if (operation === "INSERT") return "created" as const;
  if (operation === "DELETE") return "legacy_deleted" as const;
  const oldStatus = textValue(oldValues, "status");
  const newStatus = textValue(newValues, "status");
  if (newStatus === "cancelled" && oldStatus !== "cancelled") return "cancelled" as const;
  if (oldStatus === "cancelled" && newStatus !== "cancelled") return "restored" as const;
  return "edited" as const;
}

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("property") ?? "";
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = decodeCursor(rawCursor);
  if (!isUuid(propertyId) || (rawCursor && !cursor)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const db = createServiceClient();
  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
  if (!property) return Response.json({ error: "forbidden" }, { status: 403 });

  let historyQuery = db
    .from("audit_logs")
    .select("id, occurred_at, operation, record_id, actor_id, actor_source, changed_fields, old_values, new_values")
    .eq("table_name", "manual_bookings")
    .eq("subject_user_id", user.id)
    .eq("property_id", propertyId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (cursor) {
    historyQuery = historyQuery.or(
      `occurred_at.lt.${cursor[0]},and(occurred_at.eq.${cursor[0]},id.lt.${cursor[1]})`,
    );
  }

  const [historyRes, cancelledRes] = await Promise.all([
    historyQuery,
    db
      .from("manual_bookings")
      .select("*")
      .eq("owner_id", user.id)
      .eq("property_id", propertyId)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false }),
  ]);
  if (historyRes.error || cancelledRes.error) {
    return Response.json(
      { error: historyRes.error?.message ?? cancelledRes.error?.message },
      { status: 500 },
    );
  }

  const page = (historyRes.data ?? []).slice(0, PAGE_SIZE);
  const actorIds = [
    ...new Set(
      [
        ...page.map((row) => row.actor_id),
        ...(cancelledRes.data ?? []).map((row) => row.cancelled_by),
      ].filter(Boolean),
    ),
  ] as string[];
  const actorNames = new Map<
    string,
    { name: string | null; role: string | null }
  >();
  const actors = actorIds.length
    ? await db.from("profiles").select("id, display_name, role").in("id", actorIds)
    : { data: [], error: null };
  if (actors.error) {
    return Response.json({ error: actors.error.message }, { status: 500 });
  }
  for (const actor of actors.data ?? []) {
    actorNames.set(actor.id, {
      name: actor.display_name ?? null,
      role: actor.role ?? null,
    });
  }

  const items = page.map((row) => {
    const oldValues = row.old_values as AuditSnapshot;
    const newValues = row.new_values as AuditSnapshot;
    const snapshot = row.operation === "DELETE" ? oldValues : newValues;
    const actor = row.actor_id ? actorNames.get(row.actor_id) : null;
    const snapshotComplete = Boolean(
      snapshot &&
        typeof snapshot.id === "string" &&
        typeof snapshot.property_id === "string",
    );
    return {
      id: row.id,
      bookingId: row.record_id,
      type: eventType(row.operation, oldValues, newValues),
      occurredAt: row.occurred_at,
      actor: row.actor_id
        ? {
            id: row.actor_id,
            name: actor?.name ?? null,
            role: actor?.role ?? null,
          }
        : { id: null, name: null, role: null },
      actorSource: row.actor_source,
      changedFields: row.changed_fields ?? [],
      snapshotComplete,
      booking: {
        guestName: textValue(snapshot, "guest_name"),
        checkIn: textValue(snapshot, "check_in"),
        checkOut: textValue(snapshot, "check_out"),
        source: textValue(snapshot, "source"),
      },
    };
  });
  const last = page.at(-1);

  return Response.json(
    {
      items,
      cancelledBookings: (cancelledRes.data ?? []).map((booking) => {
        const actor = booking.cancelled_by
          ? actorNames.get(booking.cancelled_by)
          : null;
        return {
          ...booking,
          cancelledActor: actor
            ? {
                id: booking.cancelled_by,
                name: actor.name,
                role: actor.role,
              }
            : null,
        };
      }),
      nextCursor:
        (historyRes.data?.length ?? 0) > PAGE_SIZE && last
          ? encodeCursor(last.occurred_at, last.id)
          : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
