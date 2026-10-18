import "server-only";
import type { AnalyticsReport, ReportSection } from "@/lib/analytics/report";
import type { ExportFormat, ExportScope } from "@/lib/analytics/model";
import { recordCode } from "@/lib/finance/constants";
import { tbilisiDateTime } from "@/lib/finance/filters";
import {
  MAX_SMS_EXPORT_ROWS,
  MAX_SMS_PDF_ROWS,
  smsKindKey,
  type SmsExportBlock,
  type SmsFilters,
} from "@/lib/finance/sms";
import type { Db } from "./data";

// SMS financial control (C50): the page, its routes and its exports read the
// same three SQL definitions (admin_sms_finance_summary / _ledger /
// _purchases, migration 20261007200000), never their own sums.

export type SmsTypeRow = {
  category: string;
  kind?: string;
  messages: number;
  units: number;
  sent: number;
  delivered: number;
  failed: number;
  cost: number;
  revenue: number;
  profit: number;
};

export type SmsSummary = {
  range: { from: string | null; to: string | null };
  kpis: {
    purchased_units: number;
    purchase_cost: number;
    packages: number;
    messages: number;
    used_units: number;
    used_cost: number;
    revenue: number;
    profit: number;
    charged_messages: number;
    unpriced_units: number;
    cash_sales: number;
    cash_credits: number;
  };
  types: (SmsTypeRow & { kinds: SmsTypeRow[] })[];
  balance: {
    packages: number;
    purchased_units: number;
    paid: number;
    used_units: number;
    remaining_units: number;
    avg_unit_cost: number | null;
    remaining_value: number;
    unpriced_units: number;
    daily_units_30d: number;
    days_left: number | null;
    depletion_date: string | null;
    threshold: number;
    low: boolean;
    notified_at: string | null;
  };
};

export type SmsLedgerRow = {
  id: string;
  sent_at: string;
  source: "outbound" | "auth_code";
  kind: string;
  notification_type: string | null;
  category: string;
  status: string;
  segments: number;
  units: number;
  credit_charged: boolean;
  provider_message_id: string | null;
  cost: number;
  revenue: number;
  unpriced_units: number;
};

export type SmsLedgerPage = { count: number; rows: SmsLedgerRow[] };

export type SmsPurchase = {
  id: string;
  purchase_no: number;
  purchased_on: string;
  units: number;
  amount_gel: number;
  unit_cost: number;
  invoice_ref: string | null;
  comment: string | null;
  created_at: string;
  created_by_name: string | null;
  expense_no: number;
  active: boolean;
  voided_at: string | null;
  void_reason: string | null;
  used_units: number;
  remaining_units: number;
};

function rpcArgs(filters: SmsFilters) {
  return {
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_category: filters.category ?? undefined,
    p_status: filters.status ?? undefined,
  };
}

export async function loadSmsSummary(
  db: Db,
  filters: SmsFilters,
): Promise<SmsSummary> {
  const { data, error } = await db.rpc(
    "admin_sms_finance_summary",
    rpcArgs(filters),
  );
  if (error) throw error;
  return data as unknown as SmsSummary;
}

export async function loadSmsLedger(
  db: Db,
  filters: SmsFilters,
  limit: number,
  offset: number,
): Promise<SmsLedgerPage> {
  const { data, error } = await db.rpc("admin_sms_finance_ledger", {
    ...rpcArgs(filters),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data as unknown as SmsLedgerPage;
}

export async function loadSmsPurchases(db: Db): Promise<SmsPurchase[]> {
  const { data, error } = await db.rpc("admin_sms_finance_purchases");
  if (error) throw error;
  return (data ?? []) as unknown as SmsPurchase[];
}

// ---------------------------------------------------------------------------
// Exports (§8): the page's blocks as one report (CSV / Excel / PDF through
// src/lib/analytics/report-file.ts), always in Georgian like C42 and C49.
// ---------------------------------------------------------------------------

type T = (key: string, values?: Record<string, string | number>) => string;

export type SmsReportData = {
  summary: SmsSummary;
  purchases: SmsPurchase[] | null;
  ledger: SmsLedgerPage | null;
};

export type SmsReportInput = {
  block: SmsExportBlock;
  scope: ExportScope;
  format: ExportFormat;
  /** Already without type/status for the full scope. */
  filters: SmsFilters;
  /** "YYYY-MM-DD HH:MM", Tbilisi. */
  generatedAt: string;
};

/** Ledger rows an export of this format may hold. */
export function smsExportRowLimit(format: ExportFormat): number {
  return format === "pdf" ? MAX_SMS_PDF_ROWS : MAX_SMS_EXPORT_ROWS;
}

export function blockNeeds(block: SmsExportBlock) {
  return {
    purchases: block === "purchases" || block === "all",
    ledger: block === "ledger" || block === "all",
  };
}

function money(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function buildSmsReport(
  data: SmsReportData,
  input: SmsReportInput,
  t: T,
): AnalyticsReport {
  const { summary } = data;
  const { filters } = input;
  const period =
    filters.from || filters.to
      ? t("export.period", {
          from: filters.from ?? "…",
          to: filters.to ?? "…",
        })
      : t("export.allTime");
  const active = [
    filters.category &&
      `${t("filters.type")}: ${t(`categories.${filters.category}`)}`,
    filters.status &&
      `${t("filters.status")}: ${t(`statuses.${filters.status}`)}`,
  ].filter(Boolean) as string[];
  const meta = [
    t("export.periodLine", { period }),
    t("export.scopeLine", { scope: t(`export.scope_${input.scope}`) }),
    t("export.filtersLine", {
      filters: active.length ? active.join(" · ") : t("export.noFilters"),
    }),
    t("export.generatedLine", { at: input.generatedAt }),
    t("export.method"),
    t("export.limits"),
  ];

  const sections: ReportSection[] = [];
  const want = (b: SmsExportBlock) =>
    input.block === b || input.block === "all";

  if (want("kpis")) {
    const k = summary.kpis;
    sections.push({
      title: t("kpis.title"),
      columns: [
        { header: t("export.metric"), kind: "text", weight: 3 },
        { header: t("export.value"), kind: "number" },
      ],
      rows: [
        [t("kpis.purchased"), k.purchased_units],
        [t("kpis.used"), k.used_units],
        [t("kpis.messages"), k.messages],
        [t("kpis.purchaseCost"), money(k.purchase_cost)],
        [t("kpis.usedCost"), money(k.used_cost)],
        [t("kpis.revenue"), money(k.revenue)],
        [t("kpis.profit"), money(k.profit)],
        [t("kpis.cashSales"), money(k.cash_sales)],
        [t("kpis.unpriced"), k.unpriced_units],
      ],
      notes: [t("kpis.revenueHint"), t("kpis.profitHint")],
    });
  }

  if (want("balance")) {
    const b = summary.balance;
    sections.push({
      title: t("balance.title"),
      columns: [
        { header: t("export.metric"), kind: "text", weight: 3 },
        { header: t("export.value"), kind: "text", weight: 2 },
      ],
      rows: [
        [t("balance.remaining"), String(b.remaining_units)],
        [t("balance.purchased"), String(b.purchased_units)],
        [t("balance.used"), String(b.used_units)],
        [
          t("balance.avgPrice"),
          b.avg_unit_cost === null ? "—" : `${b.avg_unit_cost} ₾`,
        ],
        [t("balance.remainingValue"), `${b.remaining_value} ₾`],
        [t("balance.daily"), String(b.daily_units_30d)],
        [
          t("balance.forecast"),
          b.packages === 0
            ? t("balance.forecastNoPackages")
            : b.days_left === null
              ? t("balance.noForecast")
              : t("balance.forecastValue", {
                  days: b.days_left,
                  date: b.depletion_date ?? "—",
                }),
        ],
        [t("balance.threshold"), String(b.threshold)],
        [t("balance.state"), b.low ? t("balance.low") : t("balance.ok")],
      ],
      notes: [t("balance.sharedProvider")],
    });
  }

  if (want("types")) {
    const rows: (string | number | null)[][] = [];
    for (const type of summary.types) {
      rows.push(typeRow(t(`categories.${type.category}`), type));
      for (const kind of type.kinds) {
        rows.push(typeRow(`   · ${kindLabel(kind.kind ?? "", t)}`, kind));
      }
    }
    sections.push({
      title: t("types.title"),
      columns: [
        { header: t("types.type"), kind: "text", weight: 3 },
        { header: t("types.messages"), kind: "number" },
        { header: t("types.units"), kind: "number" },
        { header: t("statuses.sent"), kind: "number" },
        { header: t("statuses.delivered"), kind: "number" },
        { header: t("statuses.failed"), kind: "number" },
        { header: t("types.cost"), kind: "money" },
        { header: t("types.revenue"), kind: "money" },
        { header: t("types.profit"), kind: "money" },
      ],
      rows,
      notes: [t("types.hint")],
    });
  }

  if (want("purchases") && data.purchases) {
    sections.push({
      title: t("purchases.title"),
      columns: [
        { header: t("purchases.no"), kind: "text" },
        { header: t("purchases.date"), kind: "text" },
        { header: t("purchases.units"), kind: "number" },
        { header: t("purchases.amount"), kind: "money" },
        { header: t("purchases.unitCost"), kind: "number" },
        { header: t("purchases.used"), kind: "number" },
        { header: t("purchases.left"), kind: "number" },
        { header: t("purchases.invoice"), kind: "text" },
        { header: t("purchases.expense"), kind: "text" },
        { header: t("purchases.state"), kind: "text" },
        { header: t("purchases.comment"), kind: "text", weight: 3 },
      ],
      rows: data.purchases.map((p) => [
        `SP-${p.purchase_no}`,
        p.purchased_on,
        p.units,
        money(p.amount_gel),
        Number(p.unit_cost),
        p.used_units,
        p.remaining_units,
        p.invoice_ref ?? "",
        recordCode("EX", p.expense_no),
        p.active
          ? t("purchases.active")
          : `${t("purchases.voided")}: ${p.void_reason ?? ""}`,
        p.comment ?? "",
      ]),
      notes: [t("purchases.hint")],
    });
  }

  if (want("ledger") && data.ledger) {
    const limit = smsExportRowLimit(input.format);
    const notes = [t("ledger.hint")];
    if (data.ledger.count > data.ledger.rows.length) {
      notes.push(
        t("export.truncated", {
          shown: data.ledger.rows.length,
          total: data.ledger.count,
          limit,
        }),
      );
    }
    sections.push({
      title: t("ledger.title"),
      columns: [
        { header: t("ledger.sentAt"), kind: "text", weight: 2 },
        { header: t("types.type"), kind: "text", weight: 2 },
        { header: t("ledger.kind"), kind: "text", weight: 3 },
        { header: t("ledger.units"), kind: "number" },
        { header: t("ledger.status"), kind: "text" },
        { header: t("ledger.credit"), kind: "text" },
        { header: t("types.cost"), kind: "number" },
        { header: t("types.revenue"), kind: "number" },
        { header: t("ledger.smsId"), kind: "text", weight: 2 },
      ],
      rows: data.ledger.rows.map((r) => [
        tbilisiDateTime(r.sent_at),
        t(`categories.${r.category}`),
        kindLabel(ledgerKind(r), t),
        r.units,
        t(`statuses.${r.status}`),
        r.credit_charged ? t("ledger.yes") : t("ledger.no"),
        Number(r.cost),
        Number(r.revenue),
        r.provider_message_id ?? "",
      ]),
      notes,
    });
  }

  const stem = [
    "mybakuriani-sms",
    input.block,
    `${filters.from ?? "all"}_${filters.to ?? "all"}`,
  ].join("-");
  return {
    title: t("export.title"),
    meta,
    sections,
    fileStem: input.scope === "full" ? `${stem}-full` : stem,
    stamp: `${period} · ${t("export.generatedLine", { at: input.generatedAt })}`,
  };
}

/** A ledger row's kind as the type table keys it ("notification:<type>"). */
export function ledgerKind(
  row: Pick<SmsLedgerRow, "kind" | "notification_type">,
): string {
  return row.kind === "notification" && row.notification_type
    ? `notification:${row.notification_type}`
    : row.kind;
}

function typeRow(label: string, row: SmsTypeRow): (string | number | null)[] {
  return [
    label,
    row.messages,
    row.units,
    row.sent,
    row.delivered,
    row.failed,
    money(row.cost),
    money(row.revenue),
    money(row.profit),
  ];
}

/** A kind's words, or the raw kind for one the catalogue does not know yet. */
export function kindLabel(
  kind: string,
  t: T & { has?: (key: string) => boolean },
): string {
  const key = `kinds.${smsKindKey(kind)}`;
  if (t.has && !t.has(key)) return kind;
  return t(key);
}
