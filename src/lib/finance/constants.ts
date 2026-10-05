// Finance module vocabularies (C42). Each list must equal the CHECK list of
// the column it names in supabase/migrations/20261005120000_finance_module.sql
// (scripts/check-contracts.mjs C42 compares them). No imports: scripts/unit
// loads this file directly with Node's type stripping.

/** finance_entries.revenue_type — spec §3, plus wallet_topup and other_income. */
export const REVENUE_TYPES = [
  "listing_placement",
  "premium_featured",
  "advertising",
  "commission",
  "subscription_package",
  "vip_business",
  "other_service",
  "wallet_topup",
  "other_income",
] as const;
export type RevenueType = (typeof REVENUE_TYPES)[number];

/** finance_entries / finance_expenses / invoices payment_method (spec §4). */
export const PAYMENT_METHODS = [
  "card",
  "bank_transfer",
  "cash",
  "payment_provider",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** finance_entries.kind */
export const ENTRY_KINDS = [
  "income",
  "refund",
  "adjustment",
  "owner_payout",
  "reversal",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** finance_entries.status (only an income is ever not 'completed'). */
export const ENTRY_STATUSES = [
  "pending",
  "completed",
  "failed",
  "cancelled",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** finance_payments_v.status — the spec §4 register statuses. */
export const PAYMENT_STATUSES = [
  "completed",
  "pending",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Money actually received: the revenue journal's rows (spec §2). */
export const RECEIVED_PAYMENT_STATUSES = [
  "completed",
  "refunded",
  "partially_refunded",
] as const;

/** finance_refunds_v.status; 'review' = refunded on Keepz's side (C32). */
export const REFUND_STATUSES = [
  "completed",
  "pending",
  "failed",
  "cancelled",
  "review",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** finance_expenses.category (spec §11). */
export const EXPENSE_CATEGORIES = [
  "software_hosting",
  "marketing",
  "payment_fees",
  "salaries",
  "professional_services",
  "rent_utilities",
  "communications",
  "taxes_fees",
  "equipment",
  "transport",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** finance_documents.doc_type (spec §12). */
export const DOCUMENT_TYPES = [
  "invoice",
  "contract",
  "receipt",
  "bank_confirmation",
  "refund_document",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** invoices.status (stored lifecycle). */
export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "sent",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** finance_invoices_v.display_status — spec §16. */
export const INVOICE_DISPLAY_STATUSES = [
  "draft",
  "issued",
  "sent",
  "paid",
  "partially_paid",
  "overdue",
  "cancelled",
  "refunded",
] as const;
export type InvoiceDisplayStatus = (typeof INVOICE_DISPLAY_STATUSES)[number];

/** invoices.recipient_type */
export const RECIPIENT_TYPES = ["individual", "company"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

/** Invoice register views (spec "Finances → Invoices" menu). */
export const INVOICE_VIEWS = ["all", "unsent", "unpaid", "overdue"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

/** finance-documents bucket file_size_limit (10 MiB). */
export const MAX_FINANCE_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Mirrors finance_documents_content_type_check and the bucket's MIME list. */
export const FINANCE_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Invoice line limits (invoices_guard). */
export const MAX_INVOICE_ITEMS = 50;
export const MAX_INVOICE_ITEM_QUANTITY = 100000;
export const MAX_UNIT_PRICE = 10000000;

/** Largest single entry or expense (finance_entries_amount_max_check). */
export const MAX_ENTRY_AMOUNT = 10000000;

/** Rows one export may carry (keeps a request inside its time budget). */
export const MAX_EXPORT_ROWS = 20000;

/** A shared invoice link lives this long before it must be renewed. */
export const INVOICE_SHARE_DAYS = 30;

export function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

/** How a record's unique number is shown (spec §14): FE-12, EX-3, DOC-7. */
export function recordCode(
  prefix: "FE" | "EX" | "DOC",
  no: number | null | undefined,
): string {
  return no ? `${prefix}-${no}` : "";
}

/** A payment register row's id: FE-n for a manual entry, else Keepz's. */
export function paymentCode(row: {
  source: string | null;
  entry_no: number | null;
  reference: string | null;
  id: string | null;
}): string {
  if (row.source === "manual") return recordCode("FE", row.entry_no);
  return row.reference || row.id || "";
}

/** finance_payments_v.source */
export const PAYMENT_SOURCES = ["keepz", "manual"] as const;

/** finance_refunds_v.source ('keepz_external' = refunded on Keepz's side). */
export const REFUND_SOURCES = ["keepz", "manual", "keepz_external"] as const;

/** finance_documents.status */
export const DOCUMENT_STATUSES = ["active", "voided"] as const;

/** Every export the export route can build (C42, spec §13). */
export const REPORT_KEYS = [
  "journal",
  "payments",
  "refunds",
  "owners",
  "payouts",
  "adjustments",
  "expenses",
  "documents",
  "invoices",
  "tax",
  "vat",
  "wallet",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Raw provider / entry statuses the payments register shows (C32). */
export const SOURCE_STATUSES = [
  "pending",
  "succeeded",
  "declined",
  "cancelled",
  "expired",
  "requested",
  "submitted",
  "failed",
  "unknown",
  "completed",
  "external_refund",
] as const;

/** payments.review_flag values (payments_review_flag_check, C32). */
export const REVIEW_FLAGS = [
  "external_refund",
  "unexpected_refund_status",
  "refunded_before_credit",
  "unverified_order",
] as const;

/** AdminInvoices.pdf.* labels the invoice PDF prints. */
export const INVOICE_PDF_LABEL_KEYS = [
  "title",
  "draft",
  "cancelled",
  "issueDate",
  "dueDate",
  "status",
  "issuer",
  "recipient",
  "taxId",
  "address",
  "email",
  "phone",
  "bank",
  "iban",
  "swift",
  "itemNo",
  "description",
  "quantity",
  "unitPrice",
  "amount",
  "subtotal",
  "discount",
  "vat",
  "total",
  "paid",
  "remaining",
  "paymentMethod",
  "relatedReference",
  "linkedTransaction",
  "notes",
  "terms",
  "disclaimer",
] as const;
