import "server-only";
import type { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";
import { sanitizeQuery } from "@/lib/utils/sanitizeQuery";
import {
  FINANCE_PAGE_SIZE,
  dayEndExclusive,
  dayStart,
  type FinanceFilters,
} from "@/lib/finance/filters";
import {
  MAX_EXPORT_ROWS,
  RECEIVED_PAYMENT_STATUSES,
  paymentCode,
  type InvoiceView,
} from "@/lib/finance/constants";

// Register reads for the finance module (C42). One filter definition per
// register, shared by the paged API lists and the exports, so a download
// always holds exactly the rows the page shows.

export type Db = ReturnType<typeof createServiceClient>;

type Views = Database["public"]["Views"];
type Tables = Database["public"]["Tables"];
export type PaymentRow = Views["finance_payments_v"]["Row"];
export type RefundRow = Views["finance_refunds_v"]["Row"];
export type InvoiceRow = Views["finance_invoices_v"]["Row"];
export type EntryRow = Tables["finance_entries"]["Row"];
export type ExpenseRow = Tables["finance_expenses"]["Row"] & {
  reversed: boolean;
  documents: number;
};
export type DocumentRow = Tables["finance_documents"]["Row"];

export type PaymentView = "journal" | "registry";

export type ListPage<T, Totals> = {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
  totals: Totals;
};

// --- filter plumbing --------------------------------------------------------

type Op =
  | ["eq" | "gte" | "lt" | "lte" | "gt", string, string | number | boolean]
  | ["in", string, readonly string[]]
  | ["or", string];

type Chain = {
  eq(column: string, value: unknown): Chain;
  gte(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  lt(column: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  in(column: string, values: readonly unknown[]): Chain;
  or(filter: string): Chain;
};

function applyOps<Q>(query: Q, ops: Op[]): Q {
  let chain = query as unknown as Chain;
  for (const op of ops) {
    if (op[0] === "or") chain = chain.or(op[1]);
    else if (op[0] === "in") chain = chain.in(op[1], op[2]);
    else chain = chain[op[0]](op[1], op[2]);
  }
  return chain as unknown as Q;
}

/** An ilike search over columns, plus exact matches the caller adds. */
function search(q: string, columns: string[], exact: string[] = []): Op[] {
  const text = sanitizeQuery(q).replace(/\*/g, " ").trim();
  if (!text) return [];
  const parts = [...columns.map((c) => `${c}.ilike.*${text}*`), ...exact];
  return [["or", parts.join(",")]];
}

/** "FE-12" / "fe12" → 12 (the number shown for manual entries). */
function entryNumber(q: string): number | null {
  const match = /^FE-?(\d{1,12})$/i.exec(q.trim());
  return match ? Number(match[1]) : null;
}

function dateRange(column: string, f: FinanceFilters): Op[] {
  const ops: Op[] = [];
  if (f.from) ops.push(["gte", column, dayStart(f.from)]);
  if (f.to) ops.push(["lt", column, dayEndExclusive(f.to)]);
  return ops;
}

function equals(pairs: [string, string | null][]): Op[] {
  return pairs.filter(([, v]) => v !== null).map(([c, v]) => ["eq", c, v!]);
}

type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string; code?: string } | null;
}>;

/** Every row of a query, 1000 per request, up to `max`. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  max = MAX_EXPORT_ROWS,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  const size = 1000;
  while (rows.length < max) {
    const from = rows.length;
    const to = Math.min(from + size, max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < to - from + 1) {
      return { rows, truncated: false };
    }
  }
  const { data, error } = await page(max, max);
  if (error) throw error;
  return { rows, truncated: (data ?? []).length > 0 };
}

function sum<T>(rows: T[], pick: (row: T) => number | null): number {
  const cents = rows.reduce(
    (total, row) => total + Math.round((pick(row) ?? 0) * 100),
    0,
  );
  return cents / 100;
}

function offset(f: FinanceFilters) {
  const from = (f.page - 1) * FINANCE_PAGE_SIZE;
  return [from, from + FINANCE_PAGE_SIZE - 1] as const;
}

// --- payments register / revenue journal (spec §2, §4) ----------------------

export function paymentOps(f: FinanceFilters, view: PaymentView): Op[] {
  const ops: Op[] = [
    ...dateRange("occurred_at", f),
    ...equals([
      ["revenue_type", f.revenueType],
      ["payment_method", f.method],
      ["status", f.status],
      ["source", f.source],
      ["payer_id", f.payer],
      ["owner_id", f.owner],
      ["property_id", f.property],
      ["service_id", f.service],
    ]),
  ];
  // The journal is money actually received; an attempt is never revenue.
  if (view === "journal") ops.push(["in", "status", RECEIVED_PAYMENT_STATUSES]);
  const n = entryNumber(f.q);
  ops.push(
    ...search(
      f.q,
      ["reference", "payer_name", "object_title", "invoice_number"],
      n !== null ? [`entry_no.eq.${n}`] : [],
    ),
  );
  return ops;
}

export type PaymentTotals = {
  amount: number;
  refunded: number;
  net: number;
  own: number;
  owner: number;
};

export function paymentTotals(rows: PaymentRow[]): PaymentTotals {
  return {
    amount: sum(rows, (r) => r.amount),
    refunded: sum(rows, (r) => r.refunded_amount),
    net: sum(rows, (r) => r.net_amount),
    own: sum(rows, (r) => r.own_amount),
    owner: sum(rows, (r) => r.owner_net),
  };
}

export async function listPayments(
  db: Db,
  f: FinanceFilters,
  view: PaymentView,
): Promise<ListPage<PaymentRow, PaymentTotals | null>> {
  const ops = paymentOps(f, view);
  const [from, to] = offset(f);
  const [page, all] = await Promise.all([
    applyOps(db.from("finance_payments_v").select("*", { count: "exact" }), ops)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(from, to),
    // Money totals belong to the journal; the register lists attempts too.
    view === "journal"
      ? fetchAll((a, b) =>
          applyOps(
            db
              .from("finance_payments_v")
              .select(
                "id, amount, refunded_amount, net_amount, own_amount, owner_net",
              ),
            ops,
          )
            .order("occurred_at", { ascending: false })
            .order("id")
            .range(a, b),
        )
      : null,
  ]);
  if (page.error) throw page.error;
  return {
    rows: page.data ?? [],
    count: page.count ?? 0,
    page: f.page,
    pageSize: FINANCE_PAGE_SIZE,
    totals: all ? paymentTotals(all.rows as PaymentRow[]) : null,
  };
}

export async function exportPayments(
  db: Db,
  f: FinanceFilters,
  view: PaymentView,
) {
  const ops = paymentOps(f, view);
  return fetchAll((a, b) =>
    applyOps(db.from("finance_payments_v").select("*"), ops)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(a, b),
  );
}

// --- refunds register (spec §5) --------------------------------------------

export function refundOps(f: FinanceFilters): Op[] {
  const n = entryNumber(f.q);
  return [
    ...dateRange("occurred_at", f),
    ...equals([
      ["revenue_type", f.revenueType],
      ["payment_method", f.method],
      ["status", f.status],
      ["source", f.source],
      ["payer_id", f.payer],
    ]),
    ...search(
      f.q,
      ["original_reference", "payer_name", "reason"],
      n !== null ? [`entry_no.eq.${n}`] : [],
    ),
  ];
}

export type RefundTotals = {
  original: number;
  refunded: number;
  owner: number;
};

export function refundTotals(rows: RefundRow[]): RefundTotals {
  // Reversed manual refunds and failed ones returned nothing.
  const live = rows.filter((r) => r.status === "completed");
  return {
    original: sum(live, (r) => r.original_amount),
    refunded: sum(live, (r) => r.amount),
    owner: sum(live, (r) => r.owner_amount),
  };
}

export async function listRefunds(
  db: Db,
  f: FinanceFilters,
): Promise<ListPage<RefundRow, RefundTotals>> {
  const ops = refundOps(f);
  const [from, to] = offset(f);
  const [page, all] = await Promise.all([
    applyOps(db.from("finance_refunds_v").select("*", { count: "exact" }), ops)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(from, to),
    exportRefunds(db, f),
  ]);
  if (page.error) throw page.error;
  return {
    rows: page.data ?? [],
    count: page.count ?? 0,
    page: f.page,
    pageSize: FINANCE_PAGE_SIZE,
    totals: refundTotals(all.rows),
  };
}

export function exportRefunds(db: Db, f: FinanceFilters) {
  const ops = refundOps(f);
  return fetchAll((a, b) =>
    applyOps(db.from("finance_refunds_v").select("*"), ops)
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(a, b),
  );
}

// --- manual entries (adjustments, owner payouts) ---------------------------

export type EntryWithReversal = EntryRow & { reversed: boolean };

async function markReversed<T extends { id: string }>(
  db: Db,
  table: "finance_entries" | "finance_expenses",
  rows: T[],
): Promise<(T & { reversed: boolean })[]> {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const reversed = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from(table)
      .select("reverses_id")
      .in("reverses_id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.reverses_id) reversed.add(row.reverses_id);
    }
  }
  return rows.map((r) => ({ ...r, reversed: reversed.has(r.id) }));
}

/** Adjustments or owner payouts with their reversals (spec §6, §14). */
export async function listEntries(
  db: Db,
  kind: "adjustment" | "owner_payout",
  f: FinanceFilters,
): Promise<EntryWithReversal[]> {
  const base = await fetchAll((a, b) =>
    applyOps(db.from("finance_entries").select("*").eq("kind", kind), [
      ...dateRange("occurred_at", f),
      ...equals([
        ["owner_id", f.owner],
        ["revenue_type", f.revenueType],
        ["payment_method", f.method],
      ]),
    ])
      .order("occurred_at", { ascending: false })
      .order("entry_no", { ascending: false })
      .range(a, b),
  );
  return markReversed(db, "finance_entries", base.rows);
}

// --- expenses (spec §11) ----------------------------------------------------

export function expenseOps(f: FinanceFilters): Op[] {
  const ops: Op[] = [
    ...equals([
      ["category", f.category],
      ["payment_method", f.method],
    ]),
    ...search(f.q, [
      "supplier_name",
      "supplier_tax_id",
      "document_number",
      "note",
    ]),
  ];
  if (f.from) ops.push(["gte", "expense_date", f.from]);
  if (f.to) ops.push(["lte", "expense_date", f.to]);
  return ops;
}

async function withExpenseExtras(
  db: Db,
  rows: Tables["finance_expenses"]["Row"][],
): Promise<ExpenseRow[]> {
  const marked = await markReversed(db, "finance_expenses", rows);
  const counts = new Map<string, number>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("finance_documents")
      .select("expense_id")
      .eq("status", "active")
      .in("expense_id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.expense_id) {
        counts.set(row.expense_id, (counts.get(row.expense_id) ?? 0) + 1);
      }
    }
  }
  return marked.map((r) => ({ ...r, documents: counts.get(r.id) ?? 0 }));
}

export type ExpenseTotals = { amount: number; vat: number };

/** A reversal is the same expense with the opposite sign. */
export function signedExpense(row: { kind: string; amount: number }): number {
  return row.kind === "reversal" ? -row.amount : row.amount;
}

export function expenseTotals(
  rows: { kind: string; amount: number; vat_amount: number }[],
): ExpenseTotals {
  return {
    amount: sum(rows, (r) => signedExpense(r)),
    vat: sum(rows, (r) =>
      r.kind === "reversal" ? -r.vat_amount : r.vat_amount,
    ),
  };
}

export async function listExpenses(
  db: Db,
  f: FinanceFilters,
): Promise<ListPage<ExpenseRow, ExpenseTotals>> {
  const ops = expenseOps(f);
  const [from, to] = offset(f);
  const [page, all] = await Promise.all([
    applyOps(db.from("finance_expenses").select("*", { count: "exact" }), ops)
      .order("expense_date", { ascending: false })
      .order("expense_no", { ascending: false })
      .range(from, to),
    fetchAll((a, b) =>
      applyOps(
        db.from("finance_expenses").select("id, kind, amount, vat_amount"),
        ops,
      )
        .order("expense_date", { ascending: false })
        .order("expense_no", { ascending: false })
        .range(a, b),
    ),
  ]);
  if (page.error) throw page.error;
  return {
    rows: await withExpenseExtras(db, page.data ?? []),
    count: page.count ?? 0,
    page: f.page,
    pageSize: FINANCE_PAGE_SIZE,
    totals: expenseTotals(all.rows),
  };
}

export async function exportExpenses(db: Db, f: FinanceFilters) {
  const ops = expenseOps(f);
  const all = await fetchAll((a, b) =>
    applyOps(db.from("finance_expenses").select("*"), ops)
      .order("expense_date", { ascending: false })
      .order("expense_no", { ascending: false })
      .range(a, b),
  );
  return {
    rows: await withExpenseExtras(db, all.rows),
    truncated: all.truncated,
  };
}

// --- primary documents (spec §12) ------------------------------------------

export function documentOps(f: FinanceFilters): Op[] {
  return [
    ...dateRange("created_at", f),
    ...equals([
      ["doc_type", f.category],
      ["status", f.status],
    ]),
    ...search(f.q, ["title", "document_number", "counterparty", "file_name"]),
  ];
}

export async function listDocuments(
  db: Db,
  f: FinanceFilters,
): Promise<ListPage<DocumentRow, null>> {
  const [from, to] = offset(f);
  const page = await applyOps(
    db.from("finance_documents").select("*", { count: "exact" }),
    documentOps(f),
  )
    .order("created_at", { ascending: false })
    .order("document_no", { ascending: false })
    .range(from, to);
  if (page.error) throw page.error;
  return {
    rows: page.data ?? [],
    count: page.count ?? 0,
    page: f.page,
    pageSize: FINANCE_PAGE_SIZE,
    totals: null,
  };
}

export function exportDocuments(db: Db, f: FinanceFilters) {
  const ops = documentOps(f);
  return fetchAll((a, b) =>
    applyOps(db.from("finance_documents").select("*"), ops)
      .order("created_at", { ascending: false })
      .order("document_no", { ascending: false })
      .range(a, b),
  );
}

// --- invoices (spec §19) -----------------------------------------------------

export function invoiceOps(f: FinanceFilters, view: InvoiceView): Op[] {
  const ops: Op[] = [
    ...equals([
      ["display_status", f.status],
      ["recipient_profile_id", f.payer],
    ]),
    ...search(f.q, [
      "invoice_number",
      "recipient_name",
      "recipient_tax_id",
      "related_reference",
    ]),
  ];
  if (f.from) ops.push(["gte", "issue_date", f.from]);
  if (f.to) ops.push(["lte", "issue_date", f.to]);
  if (view === "unsent") ops.push(["eq", "status", "issued"]);
  if (view === "unpaid") {
    ops.push(["in", "status", ["issued", "sent"]], ["gt", "remaining", 0]);
  }
  if (view === "overdue") ops.push(["eq", "is_overdue", true]);
  return ops;
}

export type InvoiceTotals = { total: number; paid: number; remaining: number };

export function invoiceTotals(rows: InvoiceRow[]): InvoiceTotals {
  const live = rows.filter((r) => r.status === "issued" || r.status === "sent");
  return {
    total: sum(live, (r) => r.total),
    paid: sum(live, (r) => r.net_paid),
    remaining: sum(live, (r) => r.remaining),
  };
}

/** Each invoice's money, as register ids (spec §18-19: Invoice ↔ Transaction). */
export async function invoiceLinks(
  db: Db,
  ids: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("finance_payments_v")
      .select("invoice_id, source, entry_no, reference, id")
      .in("invoice_id", ids.slice(i, i + 200))
      .not("status", "in", "(failed,cancelled)")
      .order("occurred_at");
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.invoice_id) continue;
      out.set(row.invoice_id, [
        ...(out.get(row.invoice_id) ?? []),
        paymentCode(row),
      ]);
    }
  }
  return out;
}

export type InvoiceListRow = InvoiceRow & { linked: string[] };

export async function listInvoices(
  db: Db,
  f: FinanceFilters,
  view: InvoiceView,
): Promise<ListPage<InvoiceListRow, InvoiceTotals>> {
  const [from, to] = offset(f);
  const [page, all] = await Promise.all([
    applyOps(
      db.from("finance_invoices_v").select("*", { count: "exact" }),
      invoiceOps(f, view),
    )
      .order("created_at", { ascending: false })
      .range(from, to),
    exportInvoices(db, f, view),
  ]);
  if (page.error) throw page.error;
  const rows = page.data ?? [];
  const links = await invoiceLinks(
    db,
    rows.map((r) => r.id).filter((id): id is string => Boolean(id)),
  );
  return {
    rows: rows.map((r) => ({ ...r, linked: links.get(r.id ?? "") ?? [] })),
    count: page.count ?? 0,
    page: f.page,
    pageSize: FINANCE_PAGE_SIZE,
    totals: invoiceTotals(all.rows),
  };
}

export function exportInvoices(db: Db, f: FinanceFilters, view: InvoiceView) {
  const ops = invoiceOps(f, view);
  return fetchAll((a, b) =>
    applyOps(db.from("finance_invoices_v").select("*"), ops)
      .order("created_at", { ascending: false })
      .range(a, b),
  );
}

// --- settings ---------------------------------------------------------------

export type FinanceSettings = Tables["finance_settings"]["Row"];

export async function loadSettings(db: Db): Promise<FinanceSettings> {
  const { data, error } = await db
    .from("finance_settings")
    .select("*")
    .eq("id", true)
    .single();
  if (error) throw error;
  return data;
}

// --- what a primary document proves (spec §12, §18) -------------------------

export type DocumentLinkKind =
  "entry" | "expense" | "invoice" | "payment" | "refund";

export type DocumentLink = {
  kind: DocumentLinkKind;
  id: string;
  label: string;
};

export function documentLinkOf(
  row: DocumentRow,
): { kind: DocumentLinkKind; id: string } | null {
  if (row.entry_id) return { kind: "entry", id: row.entry_id };
  if (row.expense_id) return { kind: "expense", id: row.expense_id };
  if (row.invoice_id) return { kind: "invoice", id: row.invoice_id };
  if (row.payment_id) return { kind: "payment", id: row.payment_id };
  if (row.refund_id) return { kind: "refund", id: row.refund_id };
  return null;
}

/** A readable label for each document's linked record, by document id. */
export async function documentLinks(
  db: Db,
  rows: DocumentRow[],
): Promise<Map<string, DocumentLink>> {
  const ids = (kind: DocumentLinkKind) => [
    ...new Set(
      rows
        .map(documentLinkOf)
        .filter((l) => l?.kind === kind)
        .map((l) => l!.id),
    ),
  ];
  const labels = new Map<string, string>();
  const entries = ids("entry");
  const expenses = ids("expense");
  const invoices = ids("invoice");
  const payments = ids("payment");
  const [e, x, i, p] = await Promise.all([
    entries.length
      ? db.from("finance_entries").select("id, entry_no").in("id", entries)
      : null,
    expenses.length
      ? db
          .from("finance_expenses")
          .select("id, expense_no, supplier_name")
          .in("id", expenses)
      : null,
    invoices.length
      ? db.from("invoices").select("id, invoice_number").in("id", invoices)
      : null,
    payments.length
      ? db
          .from("payments")
          .select("id, provider_transaction_id")
          .in("id", payments)
      : null,
  ]);
  for (const result of [e, x, i, p]) if (result?.error) throw result.error;
  for (const r of e?.data ?? []) labels.set(r.id, `FE-${r.entry_no}`);
  for (const r of x?.data ?? []) {
    labels.set(r.id, `EX-${r.expense_no} · ${r.supplier_name}`);
  }
  for (const r of i?.data ?? []) labels.set(r.id, r.invoice_number ?? "");
  for (const r of p?.data ?? []) {
    labels.set(r.id, r.provider_transaction_id ?? r.id);
  }
  const out = new Map<string, DocumentLink>();
  for (const row of rows) {
    const link = documentLinkOf(row);
    if (link) {
      out.set(row.id, { ...link, label: labels.get(link.id) || link.id });
    }
  }
  return out;
}
