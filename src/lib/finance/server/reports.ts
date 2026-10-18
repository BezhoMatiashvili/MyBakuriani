import "server-only";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  EXPENSE_CATEGORIES,
  INVOICE_DISPLAY_STATUSES,
  INVOICE_VIEWS,
  MAX_EXPORT_ROWS,
  PAYMENT_METHODS,
  PAYMENT_SOURCES,
  PAYMENT_STATUSES,
  REFUND_SOURCES,
  REFUND_STATUSES,
  REPORT_KEYS,
  REVENUE_TYPES,
  REVIEW_FLAGS,
  SOURCE_STATUSES,
  isOneOf,
  type ReportKey,
  paymentCode,
  recordCode,
} from "@/lib/finance/constants";
import {
  dayEndExclusive,
  dayStart,
  isIsoDate,
  monthStart,
  parseFinanceFilters,
  parseYear,
  tbilisiDateTime,
  tbilisiToday,
  type FilterLists,
  type FinanceFilters,
} from "@/lib/finance/filters";
import {
  formatMoney,
  formatPercent,
  roundMoney,
  thresholdStatus,
} from "@/lib/finance/money";
import type { XlsxColumnKind } from "@/lib/finance/xlsx";
import {
  documentLinks,
  exportDocuments,
  exportExpenses,
  exportInvoices,
  exportPayments,
  exportRefunds,
  expenseTotals,
  invoiceLinks,
  invoiceTotals,
  listEntries,
  loadSettings,
  paymentTotals,
  refundTotals,
  signedExpense,
  type Db,
} from "./data";
import type { FinanceT } from "./labels";

// Every finance export (C42, spec §13) is built here once and rendered as
// CSV, Excel or PDF by the export route, from the same reads the register
// pages use. Labels are Georgian (labels.ts).

/** The filter values each register accepts (API lists and exports alike). */
export { REPORT_KEYS, type ReportKey };

export const FILTER_LISTS = {
  payments: {
    revenueTypes: REVENUE_TYPES,
    methods: PAYMENT_METHODS,
    statuses: PAYMENT_STATUSES,
    sources: PAYMENT_SOURCES,
  },
  refunds: {
    revenueTypes: REVENUE_TYPES,
    methods: PAYMENT_METHODS,
    statuses: REFUND_STATUSES,
    sources: REFUND_SOURCES,
  },
  expenses: { categories: EXPENSE_CATEGORIES, methods: PAYMENT_METHODS },
  documents: { categories: DOCUMENT_TYPES, statuses: DOCUMENT_STATUSES },
  invoices: { statuses: INVOICE_DISPLAY_STATUSES },
  entries: { revenueTypes: REVENUE_TYPES, methods: PAYMENT_METHODS },
} satisfies Record<string, FilterLists>;

export type ReportColumn = {
  header: string;
  kind: XlsxColumnKind;
  weight?: number;
};

export type Report = {
  title: string;
  meta: string[];
  columns: ReportColumn[];
  rows: unknown[][];
  totals: unknown[] | null;
  footnote: string | null;
  fileStem: string;
};

const GROUPS: Record<string, readonly string[]> = {
  revenueTypes: REVENUE_TYPES,
  methods: PAYMENT_METHODS,
  paymentStatuses: PAYMENT_STATUSES,
  refundStatuses: REFUND_STATUSES,
  sources: REFUND_SOURCES,
  sourceStatuses: SOURCE_STATUSES,
  reviewFlags: REVIEW_FLAGS,
  expenseCategories: EXPENSE_CATEGORIES,
  documentTypes: DOCUMENT_TYPES,
  documentStatuses: DOCUMENT_STATUSES,
  invoiceStatuses: INVOICE_DISPLAY_STATUSES,
};
type Group =
  | "revenueTypes"
  | "methods"
  | "paymentStatuses"
  | "refundStatuses"
  | "sources"
  | "sourceStatuses"
  | "reviewFlags"
  | "expenseCategories"
  | "documentTypes"
  | "documentStatuses"
  | "invoiceStatuses";

function labeller(t: FinanceT) {
  return (group: Group, value: string | null | undefined) => {
    if (!value) return "";
    return GROUPS[group].includes(value) ? t(`${group}.${value}`) : value;
  };
}

function money(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : roundMoney(value);
}

async function lookupNames(db: Db, f: FinanceFilters) {
  const names: { payer?: string; owner?: string; object?: string } = {};
  const people = [f.payer, f.owner].filter((v): v is string => Boolean(v));
  if (people.length) {
    const { data } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", people);
    for (const p of data ?? []) {
      if (p.id === f.payer) names.payer = p.display_name ?? undefined;
      if (p.id === f.owner) names.owner = p.display_name ?? undefined;
    }
  }
  if (f.property) {
    const { data } = await db
      .from("properties")
      .select("title")
      .eq("id", f.property)
      .maybeSingle();
    names.object = data?.title;
  } else if (f.service) {
    const { data } = await db
      .from("services")
      .select("title")
      .eq("id", f.service)
      .maybeSingle();
    names.object = data?.title;
  }
  return names;
}

async function filterMeta(
  db: Db,
  t: FinanceT,
  f: FinanceFilters,
  groups: { status?: Group; category?: Group } = {},
): Promise<string[]> {
  const label = labeller(t);
  const lines = [
    f.from || f.to
      ? t("export.period", { from: f.from ?? "…", to: f.to ?? "…" })
      : t("export.allTime"),
  ];
  const parts: string[] = [];
  const add = (heading: string, value: string) =>
    parts.push(`${t(`columns.${heading}`)}: ${value}`);
  if (f.revenueType) add("revenueType", label("revenueTypes", f.revenueType));
  if (f.method) add("method", label("methods", f.method));
  if (f.status && groups.status) add("status", label(groups.status, f.status));
  if (f.category && groups.category) {
    add("category", label(groups.category, f.category));
  }
  if (f.source) add("source", label("sources", f.source));
  if (f.payer || f.owner || f.property || f.service) {
    const names = await lookupNames(db, f);
    if (f.payer) add("client", names.payer ?? f.payer);
    if (f.owner) add("owner", names.owner ?? f.owner);
    if (f.property || f.service) {
      add("object", names.object ?? f.property ?? f.service ?? "");
    }
  }
  if (f.q) add("search", f.q);
  if (parts.length) lines.push(t("export.filters", { list: parts.join("; ") }));
  return lines;
}

function generatedLine(t: FinanceT): string {
  return t("export.generated", {
    at: tbilisiDateTime(new Date().toISOString()),
  });
}

function stem(key: string, from?: string | null, to?: string | null): string {
  const range = from || to ? `_${from ?? "start"}_${to ?? tbilisiToday()}` : "";
  return `mybakuriani-${key}${range}`;
}

/** Builds one report from the export route's query string. */
export async function buildReport(
  db: Db,
  key: ReportKey,
  params: URLSearchParams,
  t: FinanceT,
): Promise<Report> {
  const label = labeller(t);
  const title = t(`reports.${key}`);
  const truncatedLine = (truncated: boolean) =>
    truncated ? [t("export.truncated", { count: MAX_EXPORT_ROWS })] : [];

  if (key === "journal" || key === "payments") {
    const f = parseFinanceFilters(params, FILTER_LISTS.payments);
    const { rows, truncated } = await exportPayments(
      db,
      f,
      key === "journal" ? "journal" : "registry",
    );
    const totals = paymentTotals(rows);
    const meta = [
      ...(await filterMeta(db, t, f, { status: "paymentStatuses" })),
      generatedLine(t),
      ...truncatedLine(truncated),
    ];
    if (key === "journal") {
      return {
        title,
        meta,
        columns: [
          { header: t("columns.dateTime"), kind: "text", weight: 1.25 },
          { header: t("columns.id"), kind: "text", weight: 1.3 },
          { header: t("columns.client"), kind: "text", weight: 1.5 },
          { header: t("columns.object"), kind: "text", weight: 1.5 },
          { header: t("columns.revenueType"), kind: "text", weight: 1.4 },
          { header: t("columns.gross"), kind: "money" },
          { header: t("columns.refunded"), kind: "money" },
          { header: t("columns.net"), kind: "money" },
          { header: t("columns.own"), kind: "money" },
          { header: t("columns.ownerShare"), kind: "money" },
          { header: t("columns.method"), kind: "text", weight: 1 },
          { header: t("columns.status"), kind: "text", weight: 1.1 },
          { header: t("columns.invoice"), kind: "text", weight: 1.1 },
        ],
        rows: rows.map((r) => [
          tbilisiDateTime(r.occurred_at),
          paymentCode(r),
          r.payer_name ?? "",
          r.object_title ?? "",
          label("revenueTypes", r.revenue_type),
          money(r.amount),
          money(r.refunded_amount),
          money(r.net_amount),
          money(r.own_amount),
          money(r.owner_net),
          label("methods", r.payment_method),
          label("paymentStatuses", r.status),
          r.invoice_number ?? "",
        ]),
        totals: [
          t("export.total"),
          "",
          "",
          "",
          "",
          totals.amount,
          totals.refunded,
          totals.net,
          totals.own,
          totals.owner,
          "",
          "",
          "",
        ],
        footnote: t("disclaimers.journal"),
        fileStem: stem(key, f.from, f.to),
      };
    }
    return {
      title,
      meta,
      columns: [
        { header: t("columns.dateTime"), kind: "text", weight: 1.25 },
        { header: t("columns.id"), kind: "text", weight: 1.4 },
        { header: t("columns.source"), kind: "text", weight: 0.8 },
        { header: t("columns.client"), kind: "text", weight: 1.5 },
        { header: t("columns.method"), kind: "text", weight: 1 },
        { header: t("columns.provider"), kind: "text", weight: 0.9 },
        { header: t("columns.revenueType"), kind: "text", weight: 1.4 },
        { header: t("columns.amount"), kind: "money" },
        { header: t("columns.refunded"), kind: "money" },
        { header: t("columns.status"), kind: "text", weight: 1.1 },
        { header: t("columns.sourceStatus"), kind: "text", weight: 1 },
        { header: t("columns.reviewFlag"), kind: "text", weight: 1.1 },
        { header: t("columns.invoice"), kind: "text", weight: 1.1 },
      ],
      rows: rows.map((r) => [
        tbilisiDateTime(r.occurred_at),
        paymentCode(r),
        label("sources", r.source),
        r.payer_name ?? "",
        label("methods", r.payment_method),
        r.provider_name ?? "",
        label("revenueTypes", r.revenue_type),
        money(r.amount),
        money(r.refunded_amount),
        label("paymentStatuses", r.status),
        label("sourceStatuses", r.source_status),
        label("reviewFlags", r.review_flag),
        r.invoice_number ?? "",
      ]),
      totals: null,
      footnote: t("disclaimers.payments"),
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "refunds") {
    const f = parseFinanceFilters(params, FILTER_LISTS.refunds);
    const { rows, truncated } = await exportRefunds(db, f);
    const totals = refundTotals(rows);
    return {
      title,
      meta: [
        ...(await filterMeta(db, t, f, { status: "refundStatuses" })),
        generatedLine(t),
        ...truncatedLine(truncated),
      ],
      columns: [
        { header: t("columns.date"), kind: "text", weight: 1.2 },
        { header: t("columns.refundId"), kind: "text", weight: 1.3 },
        {
          header: t("columns.originalTransaction"),
          kind: "text",
          weight: 1.4,
        },
        { header: t("columns.source"), kind: "text", weight: 0.9 },
        { header: t("columns.client"), kind: "text", weight: 1.4 },
        { header: t("columns.originalAmount"), kind: "money" },
        { header: t("columns.refundedAmount"), kind: "money" },
        { header: t("columns.ownerShare"), kind: "money" },
        { header: t("columns.reason"), kind: "text", weight: 2 },
        { header: t("columns.status"), kind: "text", weight: 1 },
      ],
      rows: rows.map((r) => [
        tbilisiDateTime(r.occurred_at),
        r.source === "manual" ? recordCode("FE", r.entry_no) : (r.id ?? ""),
        r.original_reference ?? r.original_id ?? "",
        label("sources", r.source),
        r.payer_name ?? "",
        money(r.original_amount),
        money(r.amount),
        money(r.owner_amount),
        r.reason ?? "",
        label("refundStatuses", r.status),
      ]),
      totals: [
        t("export.total"),
        "",
        "",
        "",
        "",
        totals.original,
        totals.refunded,
        totals.owner,
        "",
        "",
      ],
      footnote: null,
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "owners") {
    const { data, error } = await db.rpc("finance_owner_payables");
    if (error) throw error;
    const rows = [...(data ?? [])].sort(
      (a, b) => b.outstanding - a.outstanding,
    );
    const total = (pick: (r: (typeof rows)[number]) => number) =>
      roundMoney(rows.reduce((s, r) => s + pick(r), 0));
    return {
      title,
      meta: [generatedLine(t)],
      columns: [
        { header: t("columns.owner"), kind: "text", weight: 2.2 },
        { header: t("columns.collected"), kind: "money" },
        { header: t("columns.refunded"), kind: "money" },
        { header: t("columns.paidOut"), kind: "money" },
        { header: t("columns.outstanding"), kind: "money" },
        { header: t("columns.lastActivity"), kind: "text", weight: 1.2 },
      ],
      rows: rows.map((r) => [
        r.owner_name ?? r.owner_id ?? "",
        money(r.collected),
        money(r.refunded),
        money(r.paid_out),
        money(r.outstanding),
        tbilisiDateTime(r.last_activity),
      ]),
      totals: [
        t("export.total"),
        total((r) => r.collected),
        total((r) => r.refunded),
        total((r) => r.paid_out),
        total((r) => r.outstanding),
        "",
      ],
      footnote: t("disclaimers.owners"),
      fileStem: stem(key),
    };
  }

  if (key === "payouts" || key === "adjustments") {
    const f = parseFinanceFilters(params, FILTER_LISTS.entries);
    const rows = await listEntries(
      db,
      key === "payouts" ? "owner_payout" : "adjustment",
      f,
    );
    const live = rows.filter((r) => !r.reversed);
    const totalAmount = roundMoney(live.reduce((s, r) => s + r.amount, 0));
    const status = (reversed: boolean) =>
      reversed ? t("entryStates.reversed") : t("entryStates.active");
    const meta = [...(await filterMeta(db, t, f)), generatedLine(t)];
    if (key === "payouts") {
      return {
        title,
        meta,
        columns: [
          { header: t("columns.date"), kind: "text", weight: 1.2 },
          { header: t("columns.id"), kind: "text", weight: 0.8 },
          { header: t("columns.owner"), kind: "text", weight: 1.8 },
          { header: t("columns.amount"), kind: "money" },
          { header: t("columns.method"), kind: "text", weight: 1 },
          { header: t("columns.reference"), kind: "text", weight: 1.3 },
          { header: t("columns.note"), kind: "text", weight: 2 },
          { header: t("columns.status"), kind: "text", weight: 1 },
        ],
        rows: rows.map((r) => [
          tbilisiDateTime(r.occurred_at),
          recordCode("FE", r.entry_no),
          r.owner_name ?? "",
          money(r.amount),
          label("methods", r.payment_method),
          r.reference ?? "",
          r.note ?? "",
          status(r.reversed),
        ]),
        totals: [t("export.total"), "", "", totalAmount, "", "", "", ""],
        footnote: null,
        fileStem: stem(key, f.from, f.to),
      };
    }
    return {
      title,
      meta,
      columns: [
        { header: t("columns.date"), kind: "text", weight: 1.2 },
        { header: t("columns.id"), kind: "text", weight: 0.8 },
        { header: t("columns.revenueType"), kind: "text", weight: 1.5 },
        { header: t("columns.amount"), kind: "money" },
        { header: t("columns.reference"), kind: "text", weight: 1.2 },
        { header: t("columns.note"), kind: "text", weight: 2.5 },
        { header: t("columns.status"), kind: "text", weight: 1 },
      ],
      rows: rows.map((r) => [
        tbilisiDateTime(r.occurred_at),
        recordCode("FE", r.entry_no),
        label("revenueTypes", r.revenue_type),
        money(r.amount),
        r.reference ?? "",
        r.note ?? "",
        status(r.reversed),
      ]),
      totals: [t("export.total"), "", "", totalAmount, "", "", ""],
      footnote: null,
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "expenses") {
    const f = parseFinanceFilters(params, FILTER_LISTS.expenses);
    const { rows, truncated } = await exportExpenses(db, f);
    const totals = expenseTotals(rows);
    return {
      title,
      meta: [
        ...(await filterMeta(db, t, f, { category: "expenseCategories" })),
        generatedLine(t),
        ...truncatedLine(truncated),
      ],
      columns: [
        { header: t("columns.date"), kind: "text", weight: 1 },
        { header: t("columns.id"), kind: "text", weight: 0.8 },
        { header: t("columns.supplier"), kind: "text", weight: 1.6 },
        { header: t("columns.taxId"), kind: "text", weight: 1.1 },
        { header: t("columns.category"), kind: "text", weight: 1.4 },
        { header: t("columns.documentNumber"), kind: "text", weight: 1.1 },
        { header: t("columns.amount"), kind: "money" },
        { header: t("columns.vat"), kind: "money" },
        { header: t("columns.method"), kind: "text", weight: 1 },
        { header: t("columns.primaryDocument"), kind: "number", weight: 0.8 },
        { header: t("columns.note"), kind: "text", weight: 1.6 },
        { header: t("columns.status"), kind: "text", weight: 1 },
      ],
      rows: rows.map((r) => [
        r.expense_date,
        recordCode("EX", r.expense_no),
        r.supplier_name,
        r.supplier_tax_id ?? "",
        label("expenseCategories", r.category),
        r.document_number ?? "",
        money(signedExpense(r)),
        money(r.kind === "reversal" ? -r.vat_amount : r.vat_amount),
        label("methods", r.payment_method),
        r.documents,
        r.note ?? "",
        r.kind === "reversal"
          ? t("entryStates.reversal")
          : r.reversed
            ? t("entryStates.reversed")
            : t("entryStates.active"),
      ]),
      totals: [
        t("export.total"),
        "",
        "",
        "",
        "",
        "",
        totals.amount,
        totals.vat,
        "",
        "",
        "",
        "",
      ],
      footnote: null,
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "documents") {
    const f = parseFinanceFilters(params, FILTER_LISTS.documents);
    const { rows, truncated } = await exportDocuments(db, f);
    const links = await documentLinks(db, rows);
    const linkOf = (r: (typeof rows)[number]) => {
      const link = links.get(r.id);
      return link ? `${t(`links.${link.kind}`)} ${link.label}` : "";
    };
    return {
      title,
      meta: [
        ...(await filterMeta(db, t, f, {
          status: "documentStatuses",
          category: "documentTypes",
        })),
        generatedLine(t),
        ...truncatedLine(truncated),
      ],
      columns: [
        { header: t("columns.id"), kind: "text", weight: 0.8 },
        { header: t("columns.documentType"), kind: "text", weight: 1.2 },
        { header: t("columns.title"), kind: "text", weight: 1.8 },
        { header: t("columns.documentNumber"), kind: "text", weight: 1 },
        { header: t("columns.documentDate"), kind: "text", weight: 1 },
        { header: t("columns.counterparty"), kind: "text", weight: 1.4 },
        { header: t("columns.amount"), kind: "money" },
        { header: t("columns.linkedRecord"), kind: "text", weight: 2 },
        { header: t("columns.fileName"), kind: "text", weight: 1.4 },
        { header: t("columns.uploaded"), kind: "text", weight: 1.2 },
        { header: t("columns.status"), kind: "text", weight: 0.9 },
        { header: "SHA-256", kind: "text", weight: 2 },
      ],
      rows: rows.map((r) => [
        recordCode("DOC", r.document_no),
        label("documentTypes", r.doc_type),
        r.title,
        r.document_number ?? "",
        r.document_date ?? "",
        r.counterparty ?? "",
        money(r.amount),
        linkOf(r),
        r.file_name,
        tbilisiDateTime(r.created_at),
        label("documentStatuses", r.status),
        r.sha256,
      ]),
      totals: null,
      footnote: null,
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "invoices") {
    const f = parseFinanceFilters(params, FILTER_LISTS.invoices);
    const viewParam = params.get("view");
    const view = isOneOf(INVOICE_VIEWS, viewParam) ? viewParam : "all";
    const { rows, truncated } = await exportInvoices(db, f, view);
    const totals = invoiceTotals(rows);
    const links = await invoiceLinks(
      db,
      rows.map((r) => r.id).filter((id): id is string => Boolean(id)),
    );
    return {
      title,
      meta: [
        ...(view === "all" ? [] : [t(`invoiceViews.${view}`)]),
        ...(await filterMeta(db, t, f, { status: "invoiceStatuses" })),
        generatedLine(t),
        ...truncatedLine(truncated),
      ],
      columns: [
        { header: t("columns.invoiceNumber"), kind: "text", weight: 1.2 },
        { header: t("columns.date"), kind: "text", weight: 1 },
        { header: t("columns.client"), kind: "text", weight: 1.6 },
        { header: t("columns.taxId"), kind: "text", weight: 1.1 },
        { header: t("columns.service"), kind: "text", weight: 1.8 },
        { header: t("columns.amount"), kind: "money" },
        { header: t("columns.paid"), kind: "money" },
        { header: t("columns.remaining"), kind: "money" },
        { header: t("columns.status"), kind: "text", weight: 1.1 },
        { header: t("columns.dueDate"), kind: "text", weight: 1 },
        { header: t("columns.linkedTransaction"), kind: "text", weight: 1.3 },
        { header: t("columns.relatedReference"), kind: "text", weight: 1.2 },
      ],
      rows: rows.map((r) => {
        const items = Array.isArray(r.items)
          ? (r.items as { description?: unknown }[])
          : [];
        const first =
          typeof items[0]?.description === "string" ? items[0].description : "";
        return [
          r.invoice_number ?? t("invoiceStatuses.draft"),
          r.issue_date ?? "",
          r.recipient_name ?? "",
          r.recipient_tax_id ?? "",
          items.length > 1 ? `${first} (+${items.length - 1})` : first,
          money(r.total),
          money(r.net_paid),
          money(r.remaining),
          label("invoiceStatuses", r.display_status),
          r.due_date ?? "",
          (links.get(r.id ?? "") ?? []).join(", "),
          r.related_reference ?? "",
        ];
      }),
      totals: [
        t("export.total"),
        "",
        "",
        "",
        "",
        totals.total,
        totals.paid,
        totals.remaining,
        "",
        "",
        "",
        "",
      ],
      footnote: t("disclaimers.invoice"),
      fileStem: stem(key, f.from, f.to),
    };
  }

  if (key === "tax") {
    const today = tbilisiToday();
    const year = parseYear(params.get("year"), Number(today.slice(0, 4)));
    const [{ data, error }, settings] = await Promise.all([
      db.rpc("finance_tax_year", { p_year: year }),
      loadSettings(db),
    ]);
    if (error) throw error;
    const rows = data ?? [];
    const total = (pick: (r: (typeof rows)[number]) => number) =>
      roundMoney(rows.reduce((s, r) => s + pick(r), 0));
    return {
      title: `${title} — ${year}`,
      meta: [
        t("export.year", { year }),
        t("export.rates", {
          rate: formatPercent(settings.small_business_rate),
          high: formatPercent(settings.small_business_high_rate),
          threshold: formatMoney(settings.small_business_threshold),
        }),
        generatedLine(t),
      ],
      columns: [
        { header: t("columns.month"), kind: "text", weight: 0.9 },
        { header: t("columns.received"), kind: "money" },
        { header: t("columns.refunds"), kind: "money" },
        { header: t("columns.adjustments"), kind: "money" },
        { header: t("columns.net"), kind: "money" },
        { header: t("columns.thirdParty"), kind: "money" },
        { header: t("columns.own"), kind: "money" },
        { header: t("columns.otherOwn"), kind: "money" },
        { header: t("columns.taxable"), kind: "money" },
        { header: t("columns.cumulative"), kind: "money" },
        { header: t("columns.rate"), kind: "text", weight: 0.7 },
        { header: t("columns.estimatedTax"), kind: "money" },
      ],
      rows: rows.map((r) => [
        r.month.slice(0, 7),
        money(r.received),
        money(r.refunds),
        money(r.adjustments),
        money(r.net),
        money(r.owner_share),
        money(r.platform_revenue),
        money(r.other_income),
        money(r.taxable),
        money(r.cumulative_taxable),
        formatPercent(r.rate),
        money(r.estimated_tax),
      ]),
      totals: [
        t("export.total"),
        total((r) => r.received),
        total((r) => r.refunds),
        total((r) => r.adjustments),
        total((r) => r.net),
        total((r) => r.owner_share),
        total((r) => r.platform_revenue),
        total((r) => r.other_income),
        total((r) => r.taxable),
        "",
        "",
        total((r) => r.estimated_tax),
      ],
      footnote: t("disclaimers.tax"),
      fileStem: `mybakuriani-tax-${year}`,
    };
  }

  if (key === "vat") {
    const asOf = isIsoDate(params.get("to"))
      ? (params.get("to") as string)
      : tbilisiToday();
    const vat = await loadVatWindow(db, asOf);
    const status = thresholdStatus(vat.turnover, vat.threshold, 80);
    return {
      title,
      meta: [
        t("export.vatWindow", { from: vat.windowStart, to: vat.windowEnd }),
        t(vat.registered ? "vat.registered" : "vat.notRegistered"),
        t("export.vatTurnover", {
          turnover: formatMoney(vat.turnover),
          threshold: formatMoney(vat.threshold),
          percent: formatPercent(status.percent),
        }),
        generatedLine(t),
      ],
      columns: [
        { header: t("columns.month"), kind: "text", weight: 1 },
        { header: t("columns.received"), kind: "money" },
        { header: t("columns.refunds"), kind: "money" },
        { header: t("columns.thirdParty"), kind: "money" },
        { header: t("columns.turnover"), kind: "money" },
      ],
      rows: vat.months.map((m) => [
        m.month.slice(0, 7),
        money(m.received),
        money(m.refunds),
        money(m.owner_share),
        money(m.taxable),
      ]),
      totals: [
        t("export.total"),
        roundMoney(vat.months.reduce((s, m) => s + m.received, 0)),
        roundMoney(vat.months.reduce((s, m) => s + m.refunds, 0)),
        roundMoney(vat.months.reduce((s, m) => s + m.owner_share, 0)),
        vat.turnover,
      ],
      footnote: t("disclaimers.vat"),
      fileStem: `mybakuriani-vat-${asOf}`,
    };
  }

  // wallet: spending of wallet credit by type (management view, never cash).
  const f = parseFinanceFilters(params, {});
  const { data, error } = await db.rpc("finance_wallet_usage", {
    // Open ends: the earliest day the module accepts, and today.
    p_from: dayStart(f.from ?? "2020-01-01"),
    p_to: dayEndExclusive(f.to ?? tbilisiToday()),
  });
  if (error) throw error;
  const rows = data ?? [];
  return {
    title,
    meta: [...(await filterMeta(db, t, f)), generatedLine(t)],
    columns: [
      { header: t("columns.revenueType"), kind: "text", weight: 2 },
      { header: t("columns.purchases"), kind: "money" },
      { header: t("columns.refunds"), kind: "money" },
      { header: t("columns.net"), kind: "money" },
      { header: t("columns.count"), kind: "number" },
    ],
    rows: rows.map((r) => [
      label("revenueTypes", r.revenue_type),
      money(r.purchases),
      money(r.refunds),
      money(r.net),
      r.purchase_count,
    ]),
    totals: [
      t("export.total"),
      roundMoney(rows.reduce((s, r) => s + r.purchases, 0)),
      roundMoney(rows.reduce((s, r) => s + r.refunds, 0)),
      roundMoney(rows.reduce((s, r) => s + r.net, 0)),
      rows.reduce((s, r) => s + r.purchase_count, 0),
    ],
    footnote: t("disclaimers.wallet"),
    fileStem: stem(key, f.from, f.to),
  };
}

export type VatWindow = {
  windowStart: string;
  windowEnd: string;
  turnover: number;
  threshold: number;
  registered: boolean;
  rate: number;
  months: {
    month: string;
    received: number;
    refunds: number;
    owner_share: number;
    taxable: number;
  }[];
};

/** The 12 calendar months ending with asOf's month (Tax Code art. 165). */
export async function loadVatWindow(db: Db, asOf: string): Promise<VatWindow> {
  const [y, m] = asOf.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
  const [window, months] = await Promise.all([
    db.rpc("finance_vat_window", { p_as_of: asOf }),
    db.rpc("finance_monthly_totals", {
      p_from_month: first,
      p_to_month: monthStart(asOf),
    }),
  ]);
  if (window.error) throw window.error;
  if (months.error) throw months.error;
  const w = window.data?.[0];
  if (!w) throw new Error("finance_vat_window returned no row");
  return {
    windowStart: w.window_start,
    windowEnd: w.window_end,
    turnover: roundMoney(w.turnover),
    threshold: w.threshold,
    registered: w.registered,
    rate: w.rate,
    months: (months.data ?? []).map((row) => ({
      month: row.month,
      received: row.received,
      refunds: row.refunds,
      owner_share: row.owner_share,
      taxable: row.taxable,
    })),
  };
}
