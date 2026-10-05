import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";
import {
  MAX_ENTRY_AMOUNT,
  PAYMENT_METHODS,
  REVENUE_TYPES,
} from "@/lib/finance/constants";
import { parseFinanceFilters } from "@/lib/finance/filters";
import { listEntries } from "@/lib/finance/server/data";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readJsonObject,
  readMoney,
  readOccurredAt,
  readOneOf,
  readText,
  readUuid,
  requireText,
} from "@/lib/finance/server/http";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// Manual ledger entries (C42, spec §2, §5, §6, §14): money received outside
// Keepz, refunds of it, own-revenue adjustments and third-party payouts. The
// database guard (finance_entries_guard) is the authority: it copies a
// refund's details from its original, caps refunds and payouts, and keeps
// every row append-only. Keepz money is never entered here.

type EntryInsert = Database["public"]["Tables"]["finance_entries"]["Insert"];

const KINDS = ["income", "refund", "adjustment", "owner_payout"] as const;

// GET ?kind=adjustment|owner_payout&<filters>
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (kind !== "adjustment" && kind !== "owner_payout") {
    return jsonError("invalid_request", 400);
  }
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.entries);
    const rows = await listEntries(createServiceClient(), kind, filters);
    return Response.json({ rows });
  } catch (error) {
    return financeErrorResponse(error, "entries list");
  }
}

function optionalMoney(value: unknown, field: string, max: number): number {
  if (value === null || value === undefined || value === "") return 0;
  return readMoney(value, field, { max });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    const kind = readOneOf(body.kind, KINDS, "kind");
    const pending = kind === "income" && body.status === "pending";
    const base = {
      kind,
      // An expected (pending) income may be dated ahead.
      occurred_at: readOccurredAt(body.occurred_on, body.occurred_time, {
        allowFuture: pending,
      }),
      reference: readText(body.reference, "reference", 200),
      created_by: adminId,
    };

    let row: EntryInsert;
    if (kind === "income") {
      const amount = readMoney(body.amount, "amount", {
        min: 0.01,
        max: MAX_ENTRY_AMOUNT,
      });
      const ownerAmount = optionalMoney(
        body.owner_amount,
        "owner_amount",
        amount,
      );
      const ownerId = readUuid(body.owner_id, "owner");
      if (ownerAmount > 0 && !ownerId) {
        throw new FinanceInputError("invalid_owner");
      }
      const payerId = readUuid(body.payer_id, "payer");
      const payerName = readText(body.payer_name, "payer_name", 200);
      if (!payerId && !payerName) throw new FinanceInputError("invalid_payer");
      const propertyId = readUuid(body.property_id, "object");
      const serviceId = readUuid(body.service_id, "object");
      if (propertyId && serviceId)
        throw new FinanceInputError("invalid_object");
      row = {
        ...base,
        status: pending ? "pending" : "completed",
        amount,
        owner_amount: ownerAmount,
        owner_id: ownerAmount > 0 ? ownerId : null,
        revenue_type: readOneOf(
          body.revenue_type,
          REVENUE_TYPES,
          "revenue_type",
        ),
        payment_method: readOneOf(
          body.payment_method,
          PAYMENT_METHODS,
          "method",
        ),
        provider_name: readText(body.provider_name, "provider", 100),
        payer_id: payerId,
        payer_name: payerName,
        payer_tax_id: readText(body.payer_tax_id, "tax_id", 50),
        property_id: propertyId,
        service_id: serviceId,
        invoice_id: readUuid(body.invoice_id, "invoice"),
        note: readText(body.note, "note", 1000),
      };
    } else if (kind === "refund") {
      const original = readUuid(body.original_entry_id, "original");
      if (!original) throw new FinanceInputError("invalid_original");
      const amount = readMoney(body.amount, "amount", {
        min: 0.01,
        max: MAX_ENTRY_AMOUNT,
      });
      row = {
        ...base,
        original_entry_id: original,
        amount,
        owner_amount: optionalMoney(body.owner_amount, "owner_amount", amount),
        payment_method: readOneOf(
          body.payment_method,
          PAYMENT_METHODS,
          "method",
        ),
        note: requireText(body.note, "note", 1000),
      };
    } else if (kind === "adjustment") {
      const amount = readMoney(body.amount, "amount", {
        min: -MAX_ENTRY_AMOUNT,
        max: MAX_ENTRY_AMOUNT,
        allowNegative: true,
      });
      if (amount === 0) throw new FinanceInputError("invalid_amount");
      row = {
        ...base,
        amount,
        revenue_type: readOneOf(
          body.revenue_type,
          REVENUE_TYPES,
          "revenue_type",
        ),
        note: requireText(body.note, "note", 1000),
      };
    } else {
      const ownerId = readUuid(body.owner_id, "owner");
      if (!ownerId) throw new FinanceInputError("invalid_owner");
      const amount = readMoney(body.amount, "amount", {
        min: 0.01,
        max: MAX_ENTRY_AMOUNT,
      });
      row = {
        ...base,
        owner_id: ownerId,
        amount,
        owner_amount: amount,
        payment_method: readOneOf(
          body.payment_method,
          PAYMENT_METHODS,
          "method",
        ),
        note: readText(body.note, "note", 1000),
      };
    }

    const { data, error } = await createServiceClient(adminId)
      .from("finance_entries")
      .insert(row)
      .select("id, entry_no")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return financeErrorResponse(error, "entry create");
  }
}
