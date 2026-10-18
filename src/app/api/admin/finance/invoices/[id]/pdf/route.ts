import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  financeErrorResponse,
  isUuidValue,
  jsonError,
} from "@/lib/finance/server/http";
import { invoicePdfBytes, loadInvoice } from "@/lib/finance/server/invoices";

export const runtime = "nodejs";

// GET /api/admin/finance/invoices/[id]/pdf[?download=1] — the invoice PDF
// (spec §17) in its current state: a draft carries a watermark, an issued
// invoice shows what has been paid (C42).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
  const db = createServiceClient();
  try {
    const invoice = await loadInvoice(db, id);
    if (!invoice) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
    const bytes = new Uint8Array(await invoicePdfBytes(db, invoice));
    const name = invoice.invoice_number ?? `draft-${id.slice(0, 8)}`;
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return financeErrorResponse(error, `invoice ${id} pdf`);
  }
}
