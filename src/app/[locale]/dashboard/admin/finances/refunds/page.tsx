"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  PAYMENT_METHODS,
  REFUND_SOURCES,
  REFUND_STATUSES,
  REVENUE_TYPES,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiDateTime } from "@/lib/finance/filters";
import { formatMoney } from "@/lib/finance/money";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import RegisterFilters, {
  useRegisterQuery,
} from "@/components/admin/finance/RegisterFilters";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Pager,
  Pill,
  Skeletons,
  noticeLinkClass,
  statusTone,
} from "@/components/admin/finance/ui";

// Refunds register (spec §5, C42): every refund tied to its original
// transaction — Keepz refunds, refunds of manual income, and Keepz payments
// refunded on Keepz's side (to be reconciled on the payments page).

type RefundRow = {
  source: "keepz" | "manual" | "keepz_external";
  id: string;
  entry_no: number | null;
  occurred_at: string;
  original_source: string;
  original_id: string | null;
  original_reference: string | null;
  original_amount: number | null;
  amount: number | null;
  owner_amount: number;
  reason: string | null;
  status: string;
  payer_name: string | null;
  payment_method: string | null;
  revenue_type: string | null;
  reversed: boolean;
};

type ListPage = {
  rows: RefundRow[];
  count: number;
  page: number;
  pageSize: number;
  totals: { original: number; refunded: number; owner: number };
};

export default function RefundsPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/refunds?${query}`,
  );
  const totals = data?.totals;

  return (
    <>
      <PageHeader title={t("refunds.title")} subtitle={t("refunds.subtitle")} />
      <Notice tone="neutral">
        {t("refunds.keepzHint")}{" "}
        <Link href="/dashboard/admin/payments" className={noticeLinkClass}>
          {t("revenue.openKeepz")}
        </Link>
      </Notice>

      <RegisterFilters
        selects={[
          {
            param: "status",
            label: t("filters.status"),
            options: REFUND_STATUSES.map((v) => ({
              value: v,
              label: t(`refundStatuses.${v}`),
            })),
          },
          {
            param: "source",
            label: t("filters.source"),
            options: REFUND_SOURCES.map((v) => ({
              value: v,
              label: t(`sources.${v}`),
            })),
          },
          {
            param: "method",
            label: t("filters.method"),
            options: PAYMENT_METHODS.map((v) => ({
              value: v,
              label: t(`methods.${v}`),
            })),
          },
          {
            param: "type",
            label: t("filters.type"),
            options: REVENUE_TYPES.map((v) => ({
              value: v,
              label: t(`revenueTypes.${v}`),
            })),
          },
        ]}
        pickers={[
          { param: "payer", label: t("filters.client"), kinds: ["client"] },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? t("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="refunds" query={filterQuery} />
      </div>

      {loading && !data ? (
        <Skeletons count={4} className="h-12" />
      ) : error ? (
        <ErrorState message={errorText(error.code)} onRetry={reload} />
      ) : !data?.rows.length ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <>
          <DataTable
            rows={data.rows}
            rowKey={(row) => `${row.source}:${row.id}`}
            minWidth={1180}
            totalsLabel={t("common.totals")}
            rowClassName={(row) =>
              row.status === "cancelled" || row.status === "failed"
                ? "opacity-60"
                : undefined
            }
            columns={[
              {
                key: "date",
                header: t("columns.date"),
                className: "whitespace-nowrap",
                render: (row) => tbilisiDateTime(row.occurred_at),
              },
              {
                key: "id",
                header: t("columns.refundId"),
                className: "whitespace-nowrap",
                render: (row) =>
                  row.source === "manual" ? (
                    recordCode("FE", row.entry_no)
                  ) : (
                    <span title={row.id}>{row.id.slice(0, 8)}…</span>
                  ),
              },
              {
                key: "original",
                header: t("columns.originalTransaction"),
                className: "whitespace-nowrap",
                render: (row) => row.original_reference ?? "—",
              },
              {
                key: "source",
                header: t("columns.source"),
                className: "whitespace-nowrap",
                render: (row) => t(`sources.${row.source}`),
              },
              {
                key: "client",
                header: t("columns.client"),
                className: "min-w-[140px]",
                render: (row) => row.payer_name ?? "—",
              },
              {
                key: "originalAmount",
                header: t("columns.originalAmount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.original_amount),
                total: totals ? formatMoney(totals.original) : undefined,
              },
              {
                key: "amount",
                header: t("columns.refundedAmount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.amount),
                total: totals ? formatMoney(totals.refunded) : undefined,
              },
              {
                key: "owner",
                header: t("columns.ownerShare"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.owner_amount),
                total: totals ? formatMoney(totals.owner) : undefined,
              },
              {
                key: "reason",
                header: t("columns.reason"),
                className: "min-w-[200px]",
                render: (row) => row.reason ?? "—",
              },
              {
                key: "status",
                header: t("columns.status"),
                render: (row) => (
                  <Pill tone={statusTone(row.status)}>
                    {t(`refundStatuses.${row.status}`)}
                  </Pill>
                ),
              },
            ]}
          />
          <Pager
            page={page}
            pageSize={data.pageSize}
            count={data.count}
            onPage={setPage}
          />
        </>
      )}
    </>
  );
}
