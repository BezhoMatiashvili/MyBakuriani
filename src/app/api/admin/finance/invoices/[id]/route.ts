import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  FinanceInputError,
  financeErrorResponse,
  isUuidValue,
  jsonError,
  readJsonObject,
  readOneOf,
  readUuid,
  requireText,
} from "@/lib/finance/server/http";
import { loadSettings } from "@/lib/finance/server/data";
import {
  archiveInvoicePdf,
  emailInvoiceLink,
  invoiceEmailReady,
  invoiceVatRate,
  loadInvoice,
  newShareToken,
  readInvoiceDraft,
  shareUrl,
  siteOrigin,
} from "@/lib/finance/server/invoices";

export const runtime = "nodejs";

// One invoice (C42, spec §15-18).
//   GET   the invoice with the money moved against it and its documents
//   PUT   edit a draft (issued content is frozen by invoices_guard)
//   POST  {action}: issue | cancel {reason} | mark_sent {to} | share |
//         unshare | send {to?} | duplicate | link_payment {payment_id} |
//         archive_pdf

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS = [
  "issue",
  "cancel",
  "mark_sent",
  "share",
  "unshare",
  "send",
  "duplicate",
  "link_payment",
  "archive_pdf",
] as const;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET(_request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
  const db = createServiceClient();
  try {
    const invoice = await loadInvoice(db, id);
    if (!invoice) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
    const [payments, documents] = await Promise.all([
      db
        .from("finance_payments_v")
        .select("*")
        .eq("invoice_id", id)
        .order("occurred_at"),
      db
        .from("finance_documents")
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (payments.error) throw payments.error;
    if (documents.error) throw documents.error;
    return Response.json({
      invoice,
      payments: payments.data ?? [],
      documents: documents.data ?? [],
    });
  } catch (error) {
    return financeErrorResponse(error, `invoice ${id}`);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  const db = createServiceClient(guard.admin.userId);
  try {
    const draft = readInvoiceDraft(
      body,
      invoiceVatRate(await loadSettings(db)),
    );
    const { data, error } = await db
      .from("invoices")
      .update({ ...draft, items: draft.items as unknown as Json })
      .eq("id", id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const exists = await loadInvoice(db, id);
      return exists
        ? jsonError("FINANCE_INVOICE_LOCKED", 409)
        : jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
    }
    return Response.json(data);
  } catch (error) {
    return financeErrorResponse(error, `invoice ${id} update`);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  const { id } = await params;
  if (!isUuidValue(id)) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);
  const db = createServiceClient(adminId);

  try {
    const action = readOneOf(body.action, ACTIONS, "action");

    if (action === "issue") {
      const { data, error } = await db.rpc("finance_issue_invoice", {
        p_invoice_id: id,
      });
      if (error) throw error;
      const archived = await archiveInvoicePdf(db, id, adminId).catch(
        (archiveError: unknown) => {
          console.error("[finance] invoice archive failed:", archiveError);
          return false;
        },
      );
      return Response.json({ invoice_number: data, archived });
    }

    if (action === "archive_pdf") {
      return Response.json({
        archived: await archiveInvoicePdf(db, id, adminId),
      });
    }

    if (action === "cancel") {
      const { error } = await db.rpc("finance_cancel_invoice", {
        p_invoice_id: id,
        p_reason: requireText(body.reason, "reason", 500),
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (action === "mark_sent") {
      const { error } = await db.rpc("finance_mark_invoice_sent", {
        p_invoice_id: id,
        p_to: requireText(body.to, "to", 320),
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (action === "unshare") {
      const { data, error } = await db
        .from("invoices")
        .update({ share_token_hash: null, share_expires_at: null })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
      return Response.json({ ok: true });
    }

    if (action === "share" || action === "send") {
      const invoice = await loadInvoice(db, id);
      if (!invoice) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
      if (invoice.status !== "issued" && invoice.status !== "sent") {
        return jsonError("FINANCE_STATUS_TRANSITION", 409);
      }
      let to: string | null = null;
      if (action === "send") {
        to =
          typeof body.to === "string" && body.to.trim()
            ? body.to.trim()
            : invoice.recipient_email;
        if (!to || to.length > 200 || !EMAIL_RE.test(to)) {
          throw new FinanceInputError("invalid_email");
        }
        // Checked before the new link replaces the one already sent.
        const ready = invoiceEmailReady(to);
        if (!ready.ok) return jsonError(ready.code, ready.status);
        const allowed = await checkRateLimit(
          `finance-invoice-send:admin:${adminId}`,
          30,
          3_600_000,
        );
        if (!allowed) return jsonError("rate_limited", 429);
      }
      // Only the hash is stored, so every share or send issues a new link
      // and the previous one stops working.
      const link = newShareToken();
      const { error } = await db
        .from("invoices")
        .update({
          share_token_hash: link.hash,
          share_expires_at: link.expiresAt,
        })
        .eq("id", id);
      if (error) throw error;
      const url = shareUrl(siteOrigin(request), link.token);
      if (action === "send" && to) {
        const sent = await emailInvoiceLink(invoice, to, url, link.expiresAt);
        if (!sent.ok) return jsonError(sent.code, sent.status);
        const marked = await db.rpc("finance_mark_invoice_sent", {
          p_invoice_id: id,
          p_to: to,
        });
        if (marked.error) throw marked.error;
      }
      return Response.json({ url, expires_at: link.expiresAt, sent_to: to });
    }

    if (action === "duplicate") {
      const invoice = await loadInvoice(db, id);
      if (!invoice) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
      const items = (Array.isArray(invoice.items) ? invoice.items : []).map(
        (item) => {
          const row = item as Record<string, unknown>;
          return {
            description: row.description,
            quantity: row.quantity,
            unit_price: row.unit_price,
          };
        },
      );
      const { data, error } = await db
        .from("invoices")
        .insert({
          status: "draft",
          recipient_type: invoice.recipient_type ?? "company",
          recipient_name: invoice.recipient_name ?? "",
          recipient_tax_id: invoice.recipient_tax_id,
          recipient_address: invoice.recipient_address,
          recipient_email: invoice.recipient_email,
          recipient_phone: invoice.recipient_phone,
          recipient_profile_id: invoice.recipient_profile_id,
          items: items as unknown as Json,
          discount_amount: invoice.discount_amount ?? 0,
          // The copy follows today's VAT status (spec §15).
          vat_rate: invoiceVatRate(await loadSettings(db)),
          payment_method: invoice.payment_method,
          related_reference: invoice.related_reference,
          notes: invoice.notes,
          terms: invoice.terms,
          duplicated_from: id,
          created_by: adminId,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json(data, { status: 201 });
    }

    // link_payment: a succeeded, credited Keepz payment that paid this
    // invoice (invoices_guard checks it and the invoice's total).
    const paymentId = readUuid(body.payment_id, "payment");
    if (!paymentId) throw new FinanceInputError("invalid_payment");
    const { data, error } = await db
      .from("invoices")
      .update({ payment_id: paymentId })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("FINANCE_INVOICE_NOT_FOUND", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return financeErrorResponse(error, `invoice ${id} action`);
  }
}
