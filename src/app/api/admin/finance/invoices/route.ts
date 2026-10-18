import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import { INVOICE_VIEWS, isOneOf } from "@/lib/finance/constants";
import { parseFinanceFilters } from "@/lib/finance/filters";
import { listInvoices, loadSettings } from "@/lib/finance/server/data";
import {
  financeErrorResponse,
  jsonError,
  readJsonObject,
  readUuid,
} from "@/lib/finance/server/http";
import {
  archiveInvoicePdf,
  invoiceVatRate,
  readInvoiceDraft,
} from "@/lib/finance/server/invoices";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// The invoices register (spec §19) and new drafts (spec §15), C42.

// GET ?view=all|unsent|unpaid|overdue&<filters>&page=
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const viewParam = params.get("view");
  const view = isOneOf(INVOICE_VIEWS, viewParam) ? viewParam : "all";
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.invoices);
    return Response.json(
      await listInvoices(createServiceClient(), filters, view),
    );
  } catch (error) {
    return financeErrorResponse(error, "invoices list");
  }
}

// POST {…draft, issue?: boolean, duplicated_from?} — saves a draft and, when
// asked, issues it right away. A failed issue keeps the draft (its id comes
// back with issueError) so the admin can fix the settings and issue again.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  const db = createServiceClient(adminId);

  try {
    const draft = readInvoiceDraft(
      body,
      invoiceVatRate(await loadSettings(db)),
    );
    const { data, error } = await db
      .from("invoices")
      .insert({
        ...draft,
        items: draft.items as unknown as Json,
        status: "draft",
        duplicated_from: readUuid(body.duplicated_from, "duplicated_from"),
        created_by: adminId,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (body.issue !== true) return Response.json(data, { status: 201 });
    const issued = await db.rpc("finance_issue_invoice", {
      p_invoice_id: data.id,
    });
    if (issued.error) {
      const failure = await financeErrorResponse(
        issued.error,
        "invoice issue",
      ).json();
      return Response.json(
        { id: data.id, issueError: failure.error },
        { status: 201 },
      );
    }
    const archived = await archiveInvoicePdf(db, data.id, adminId).catch(
      (archiveError: unknown) => {
        console.error("[finance] invoice archive failed:", archiveError);
        return false;
      },
    );
    return Response.json(
      { id: data.id, invoice_number: issued.data, archived },
      { status: 201 },
    );
  } catch (error) {
    return financeErrorResponse(error, "invoice create");
  }
}
