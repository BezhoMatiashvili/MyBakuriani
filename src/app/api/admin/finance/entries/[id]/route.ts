import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
  readJsonObject,
  readOccurredAt,
  readOneOf,
  requireText,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// POST /api/admin/finance/entries/[id] {action, …} (C42, spec §14)
//   reverse   {note}  a reversal row that mirrors the entry in its period
//   complete  {occurred_on?, occurred_time?}  a pending income arrived
//   fail | cancel     a pending income that will not arrive
// Nothing is ever edited or deleted; finance_entries_guard enforces it.

const ACTIONS = ["reverse", "complete", "fail", "cancel"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_ENTRY_NOT_FOUND", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  const db = createServiceClient(guard.admin.userId);

  try {
    const action = readOneOf(body.action, ACTIONS, "action");
    if (action === "reverse") {
      const note = requireText(body.note, "note", 1000);
      const { data: original, error } = await db
        .from("finance_entries")
        .select("id, amount, occurred_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!original) return jsonError("FINANCE_ENTRY_NOT_FOUND", 404);
      // The guard copies every field from the original; amount and date are
      // passed only because the columns are NOT NULL.
      const { data, error: insertError } = await db
        .from("finance_entries")
        .insert({
          kind: "reversal",
          reverses_id: original.id,
          amount: original.amount,
          occurred_at: original.occurred_at,
          note,
          created_by: guard.admin.userId,
        })
        .select("id, entry_no")
        .single();
      if (insertError) throw insertError;
      return Response.json(data, { status: 201 });
    }

    const update =
      action === "complete"
        ? {
            status: "completed",
            occurred_at: readOccurredAt(body.occurred_on, body.occurred_time),
          }
        : { status: action === "fail" ? "failed" : "cancelled" };
    const { data, error } = await db
      .from("finance_entries")
      .update(update)
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("FINANCE_ENTRY_NOT_FOUND", 404);
    return Response.json(data);
  } catch (error) {
    return financeErrorResponse(error, `entry ${id}`);
  }
}
