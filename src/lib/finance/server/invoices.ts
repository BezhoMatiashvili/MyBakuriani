import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Json } from "@/lib/types/database";
import { getEmailConfig } from "@/lib/email/config";
import { cleanSubject, escapeHtml } from "@/lib/email/render";
import { sendWithResend } from "@/lib/email/resend";
import {
  INVOICE_PDF_LABEL_KEYS,
  INVOICE_SHARE_DAYS,
  MAX_INVOICE_ITEMS,
  MAX_INVOICE_ITEM_QUANTITY,
  MAX_UNIT_PRICE,
  PAYMENT_METHODS,
  RECIPIENT_TYPES,
  paymentCode,
  type RecipientType,
} from "@/lib/finance/constants";
import { isIsoDate, tbilisiDate } from "@/lib/finance/filters";
import { formatMoney, parseMoney, priceInvoice } from "@/lib/finance/money";
import { renderInvoicePdf, type InvoicePdfLabels } from "@/lib/finance/pdf";
import { loadSettings, type Db, type InvoiceRow } from "./data";
import {
  FinanceInputError,
  readMoney,
  readOneOf,
  readText,
  readUuid,
  requireText,
} from "./http";
import { financeT, type FinanceT } from "./labels";

// Invoices (C42, spec §15-20). An invoice is never revenue: only the money
// that pays it is (a linked Keepz payment or manual incomes naming it), so
// one invoice cannot count twice. invoices_guard() prices drafts and freezes
// issued content; this module validates input, renders the PDF, keeps the
// issued copy in the documents archive and sends the secure link.

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type InvoiceDraft = {
  recipient_type: RecipientType;
  recipient_name: string;
  recipient_tax_id: string | null;
  recipient_address: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_profile_id: string | null;
  items: InvoiceItemInput[];
  discount_amount: number;
  vat_rate: number | null;
  due_date: string | null;
  payment_method: string | null;
  related_reference: string | null;
  notes: string | null;
  terms: string | null;
};

const blank = (value: unknown) =>
  value === null || value === undefined || value === "";

function readQuantity(value: unknown): number {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim().replace(",", ".")
        : "";
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(text)) {
    throw new FinanceInputError("invalid_items");
  }
  const quantity = Number(text);
  if (quantity <= 0 || quantity > MAX_INVOICE_ITEM_QUANTITY) {
    throw new FinanceInputError("invalid_items");
  }
  return quantity;
}

export function readInvoiceItems(value: unknown): InvoiceItemInput[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_INVOICE_ITEMS
  ) {
    throw new FinanceInputError("invalid_items");
  }
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") {
      throw new FinanceInputError("invalid_items");
    }
    const item = raw as Record<string, unknown>;
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const price = parseMoney(item.unit_price);
    if (
      !description ||
      description.length > 300 ||
      price === null ||
      price > MAX_UNIT_PRICE
    ) {
      throw new FinanceInputError("invalid_items");
    }
    return {
      description,
      quantity: readQuantity(item.quantity),
      unit_price: price,
    };
  });
}

function readEmail(value: unknown): string | null {
  const email = readText(value, "email", 200);
  if (email && !EMAIL_RE.test(email)) {
    throw new FinanceInputError("invalid_email");
  }
  return email;
}

/**
 * The VAT rate a draft carries: the settings' rate while MyBakuriani is
 * VAT-registered, else none (spec §15: a VAT line only when the regime calls
 * for one; finance_issue_invoice() refuses a draft saved under the other
 * status).
 */
export function invoiceVatRate(settings: {
  vat_registered: boolean;
  vat_rate: number;
}): number | null {
  return settings.vat_registered && settings.vat_rate > 0
    ? settings.vat_rate
    : null;
}

/** A draft from the invoice form (POST, or PUT while still a draft). */
export function readInvoiceDraft(
  body: Record<string, unknown>,
  vatRate: number | null,
): InvoiceDraft {
  const items = readInvoiceItems(body.items);
  const discount = blank(body.discount_amount)
    ? 0
    : readMoney(body.discount_amount, "discount", { max: 100_000_000 });
  if (discount > priceInvoice(items, 0, null).subtotal) {
    throw new FinanceInputError("invalid_discount");
  }
  if (!blank(body.due_date) && !isIsoDate(body.due_date)) {
    throw new FinanceInputError("invalid_due_date");
  }
  return {
    recipient_type: readOneOf(
      body.recipient_type,
      RECIPIENT_TYPES,
      "recipient_type",
    ),
    recipient_name: requireText(body.recipient_name, "recipient_name", 200),
    recipient_tax_id: readText(body.recipient_tax_id, "tax_id", 50),
    recipient_address: readText(body.recipient_address, "address", 300),
    recipient_email: readEmail(body.recipient_email),
    recipient_phone: readText(body.recipient_phone, "phone", 50),
    recipient_profile_id: readUuid(body.recipient_profile_id, "recipient"),
    items,
    discount_amount: discount,
    vat_rate: vatRate,
    due_date: blank(body.due_date) ? null : (body.due_date as string),
    payment_method: blank(body.payment_method)
      ? null
      : readOneOf(body.payment_method, PAYMENT_METHODS, "method"),
    related_reference: readText(
      body.related_reference,
      "related_reference",
      100,
    ),
    notes: readText(body.notes, "notes", 2000),
    terms: readText(body.terms, "terms", 2000),
  };
}

/** A template: any subset of the draft fields, each validated. */
export function readTemplatePayload(value: unknown): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FinanceInputError("invalid_template");
  }
  const body = value as Record<string, unknown>;
  const out: Record<string, Json> = {};
  if (!blank(body.recipient_type)) {
    out.recipient_type = readOneOf(
      body.recipient_type,
      RECIPIENT_TYPES,
      "recipient_type",
    );
  }
  const texts: [string, number][] = [
    ["recipient_name", 200],
    ["recipient_tax_id", 50],
    ["recipient_address", 300],
    ["recipient_phone", 50],
    ["related_reference", 100],
    ["notes", 2000],
    ["terms", 2000],
  ];
  for (const [key, max] of texts) {
    const text = readText(body[key], key, max);
    if (text) out[key] = text;
  }
  const email = readEmail(body.recipient_email);
  if (email) out.recipient_email = email;
  if (Array.isArray(body.items) && body.items.length > 0) {
    out.items = readInvoiceItems(body.items);
  }
  if (!blank(body.discount_amount)) {
    out.discount_amount = readMoney(body.discount_amount, "discount", {
      max: 100_000_000,
    });
  }
  if (!blank(body.payment_method)) {
    out.payment_method = readOneOf(
      body.payment_method,
      PAYMENT_METHODS,
      "method",
    );
  }
  return out;
}

// --- secure link (spec §17) -------------------------------------------------

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh link: only its hash is stored, so a new one replaces the old. */
export function newShareToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashShareToken(token),
    expiresAt: new Date(
      Date.now() + INVOICE_SHARE_DAYS * 86_400_000,
    ).toISOString(),
  };
}

/** The public origin links point at (NEXT_PUBLIC_SITE_URL, as in C27). */
export function siteOrigin(request: Request): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return /^https?:\/\//.test(site) ? site : new URL(request.url).origin;
}

export function shareUrl(origin: string, token: string): string {
  return `${origin}/api/invoices/${token}`;
}

// --- PDF (spec §17) ---------------------------------------------------------

type IssuerSnapshot = {
  legal_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_iban?: string | null;
  bank_swift?: string | null;
};

function pdfLabels(t: FinanceT): InvoicePdfLabels {
  const keys = INVOICE_PDF_LABEL_KEYS;
  const labels = Object.fromEntries(
    keys.map((key) => [key, t(`pdf.${key}`)]),
  ) as Omit<InvoicePdfLabels, "page">;
  return { ...labels, page: (page, pages) => t("pdf.page", { page, pages }) };
}

/** The money moved against an invoice, as register ids (spec §18). */
export async function linkedTransactions(
  db: Db,
  invoiceId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("finance_payments_v")
    .select("source, entry_no, reference, id, status")
    .eq("invoice_id", invoiceId)
    .not("status", "in", "(failed,cancelled)")
    .order("occurred_at");
  if (error) throw error;
  return (data ?? []).map(paymentCode).filter(Boolean);
}

export async function invoicePdfBytes(
  db: Db,
  invoice: InvoiceRow,
): Promise<Uint8Array> {
  const [ti, tf] = await Promise.all([
    financeT("AdminInvoices"),
    financeT("AdminFinances"),
  ]);
  let issuer = invoice.issuer as IssuerSnapshot | null;
  if (!issuer) {
    // A draft is previewed with today's settings; issuing snapshots them.
    const s = await loadSettings(db);
    issuer = {
      legal_name: s.legal_name,
      tax_id: s.tax_id,
      address: s.legal_address,
      email: s.email,
      phone: s.phone,
      bank_name: s.bank_name,
      bank_iban: s.bank_iban,
      bank_swift: s.bank_swift,
    };
  }
  const draft = invoice.status === "draft";
  // Nothing is owed on a draft or a cancelled invoice: no paid/remaining.
  const noBalance = draft || invoice.status === "cancelled";
  const linked = invoice.id ? await linkedTransactions(db, invoice.id) : [];
  const items = Array.isArray(invoice.items)
    ? (invoice.items as Record<string, unknown>[])
    : [];
  return renderInvoicePdf(
    {
      number: invoice.invoice_number,
      statusLabel: tf(`invoiceStatuses.${invoice.display_status ?? "draft"}`),
      watermark: draft
        ? "draft"
        : invoice.status === "cancelled"
          ? "cancelled"
          : null,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      issuer: {
        name: issuer.legal_name ?? null,
        taxId: issuer.tax_id ?? null,
        address: issuer.address ?? null,
        email: issuer.email ?? null,
        phone: issuer.phone ?? null,
        bankName: issuer.bank_name ?? null,
        bankIban: issuer.bank_iban ?? null,
        bankSwift: issuer.bank_swift ?? null,
      },
      recipient: {
        name: invoice.recipient_name,
        taxId: invoice.recipient_tax_id,
        address: invoice.recipient_address,
        email: invoice.recipient_email,
        phone: invoice.recipient_phone,
      },
      items: items.map((item) => ({
        description: String(item.description ?? ""),
        quantity: Number(item.quantity ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        amount: Number(item.amount ?? 0),
      })),
      subtotal: invoice.subtotal ?? 0,
      discount: invoice.discount_amount ?? 0,
      vatRate: invoice.vat_rate,
      vat: invoice.vat_amount ?? 0,
      total: invoice.total ?? 0,
      paid: noBalance ? null : (invoice.net_paid ?? 0),
      remaining: noBalance ? null : (invoice.remaining ?? 0),
      paymentMethodLabel: invoice.payment_method
        ? tf(`methods.${invoice.payment_method}`)
        : null,
      relatedReference: invoice.related_reference,
      linkedTransaction: linked.length ? linked.join(", ") : null,
      notes: invoice.notes,
      terms: invoice.terms,
    },
    pdfLabels(ti),
  );
}

export async function loadInvoice(
  db: Db,
  id: string,
): Promise<InvoiceRow | null> {
  const { data, error } = await db
    .from("finance_invoices_v")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Keeps the issued invoice's PDF in the primary documents archive (spec §18)
 * once: the copy as it was issued. Later downloads render the current state
 * (paid, remaining); the frozen content is the same.
 */
export async function archiveInvoicePdf(
  db: Db,
  invoiceId: string,
  adminId: string,
): Promise<boolean> {
  const invoice = await loadInvoice(db, invoiceId);
  if (!invoice?.invoice_number || invoice.status === "draft") return false;
  const { data: existing, error } = await db
    .from("finance_documents")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("doc_type", "invoice")
    .eq("status", "active")
    .eq("document_number", invoice.invoice_number)
    .limit(1);
  if (error) throw error;
  if (existing?.length) return true;

  const bytes = await invoicePdfBytes(db, invoice);
  const ti = await financeT("AdminInvoices");
  const id = randomUUID();
  const path = `${id}.pdf`;
  const upload = await db.storage
    .from("finance-documents")
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "60",
    });
  if (upload.error) throw upload.error;
  const { error: insertError } = await db.from("finance_documents").insert({
    id,
    doc_type: "invoice",
    title: `${ti("pdf.title")} ${invoice.invoice_number}`,
    document_number: invoice.invoice_number,
    document_date: invoice.issue_date,
    counterparty: invoice.recipient_name,
    amount: invoice.total,
    storage_path: path,
    file_name: `${invoice.invoice_number}.pdf`,
    content_type: "application/pdf",
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    invoice_id: invoiceId,
    uploaded_by: adminId,
  });
  if (insertError) {
    await db.storage.from("finance-documents").remove([path]);
    throw insertError;
  }
  return true;
}

// --- e-mail (spec §17) ------------------------------------------------------

export type EmailFailure = { ok: false; code: string; status: number };
export type EmailResult = { ok: true } | EmailFailure;
type EmailReady = {
  ok: true;
  apiKey: string;
  config: ReturnType<typeof getEmailConfig>;
};

/**
 * Whether an invoice e-mail to `to` may go out under the C33 delivery
 * switches (EMAIL_DELIVERY_ENABLED, EMAIL_ALLOWED_RECIPIENTS). The send route
 * asks before it replaces the invoice's link.
 */
export function invoiceEmailReady(to: string): EmailReady | EmailFailure {
  const config = getEmailConfig();
  if (!config.deliveryEnabled || !config.resendApiKey) {
    return { ok: false, code: "email_disabled", status: 503 };
  }
  if (
    config.allowedRecipients !== "all" &&
    !config.allowedRecipients.has(to.toLowerCase())
  ) {
    return { ok: false, code: "email_recipient_not_allowed", status: 403 };
  }
  return { ok: true, apiKey: config.resendApiKey, config };
}

/**
 * Sends the secure link (not an attachment) through Resend, under the C33
 * delivery switches. An admin-triggered send, outside the notification queue
 * and its budget.
 */
export async function emailInvoiceLink(
  invoice: InvoiceRow,
  to: string,
  url: string,
  expiresAt: string,
): Promise<EmailResult> {
  const ready = invoiceEmailReady(to);
  if (!ready.ok) return ready;
  const { apiKey, config } = ready;
  const t = await financeT("AdminInvoices");
  const issuer = (invoice.issuer ?? {}) as IssuerSnapshot;
  const number = invoice.invoice_number ?? "";
  const subject = cleanSubject(t("email.subject", { number }));
  const lines = [
    t("email.greeting", { name: invoice.recipient_name ?? "" }),
    t("email.intro", { number }),
    t("email.total", { amount: formatMoney(invoice.total) }),
    ...(invoice.due_date ? [t("email.due", { date: invoice.due_date })] : []),
  ];
  const contact = [issuer.legal_name, issuer.email, issuer.phone]
    .filter(Boolean)
    .join(" · ");
  const expires = t("email.expires", { date: tbilisiDate(expiresAt) });
  const button = t("email.button");
  const brand = "#1a56db";
  const html = `<!doctype html>
<html lang="ka"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Noto Sans Georgian',Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:${brand};padding-bottom:18px">MyBakuriani</td></tr>
${lines.map((line) => `<tr><td style="font-size:15px;line-height:1.6;color:#374151">${escapeHtml(line)}</td></tr>`).join("\n")}
<tr><td><p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${escapeHtml(button)}</a></p></td></tr>
<tr><td style="font-size:13px;line-height:1.5;padding-top:14px;color:#6b7280">${escapeHtml(expires)}</td></tr>
</table>
<p style="max-width:560px;font-size:12px;line-height:1.5;color:#6b7280;margin:16px auto 0">${escapeHtml(t("email.footer"))}${contact ? `<br>${escapeHtml(contact)}` : ""}</p>
</td></tr></table>
</body></html>`;
  const text = [
    ...lines,
    "",
    `${button}: ${url}`,
    expires,
    "",
    "--",
    t("email.footer"),
    ...(contact ? [contact] : []),
  ].join("\n");

  const outcome = await sendWithResend(apiKey, {
    id: randomUUID(),
    from: config.from,
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    to,
    subject,
    html,
    text,
    tag: "invoice",
  });
  if (outcome.kind !== "sent") {
    console.error("[finance] invoice e-mail failed:", outcome);
    return { ok: false, code: "email_failed", status: 502 };
  }
  return { ok: true };
}
