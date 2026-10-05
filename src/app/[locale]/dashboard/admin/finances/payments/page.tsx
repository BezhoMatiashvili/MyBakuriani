"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  PAYMENT_METHODS,
  PAYMENT_SOURCES,
  PAYMENT_STATUSES,
  REVENUE_TYPES,
} from "@/lib/finance/constants";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import {
  PaymentDetailsModal,
  usePaymentColumns,
  type PaymentRow,
} from "@/components/admin/finance/PaymentDetails";
import RegisterFilters, {
  useRegisterQuery,
} from "@/components/admin/finance/RegisterFilters";
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Pager,
  Skeletons,
  buttonClass,
} from "@/components/admin/finance/ui";

// Payments register (spec §4, C42): every payment and attempt, Keepz and
// manual, with its status. An attempt is never revenue; the journal shows
// only money received.

type ListPage = {
  rows: PaymentRow[];
  count: number;
  page: number;
  pageSize: number;
};

export default function PaymentsRegisterPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/payments?view=registry&${query}`,
  );
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  // An attempt is not revenue: the register has no money totals (spec §4).
  const columns = usePaymentColumns(setSelected, null, { registry: true });

  return (
    <>
      <PageHeader
        title={t("payments.title")}
        subtitle={t("payments.subtitle")}
        actions={
          <Link href="/dashboard/admin/payments" className={buttonClass()}>
            {t("payments.keepzLink")}
          </Link>
        }
      />
      <Notice tone="neutral">{t("disclaimers.payments")}</Notice>

      <RegisterFilters
        selects={[
          {
            param: "status",
            label: t("filters.status"),
            options: PAYMENT_STATUSES.map((v) => ({
              value: v,
              label: t(`paymentStatuses.${v}`),
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
          {
            param: "source",
            label: t("filters.source"),
            options: PAYMENT_SOURCES.map((v) => ({
              value: v,
              label: t(`sources.${v}`),
            })),
          },
        ]}
        pickers={[
          { param: "payer", label: t("filters.client"), kinds: ["client"] },
          { param: "owner", label: t("filters.owner"), kinds: ["client"] },
          {
            param: "object",
            label: t("filters.object"),
            kinds: ["property", "service"],
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? t("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="payments" query={filterQuery} />
      </div>

      {loading && !data ? (
        <Skeletons count={5} className="h-12" />
      ) : error ? (
        <ErrorState message={errorText(error.code)} onRetry={reload} />
      ) : !data?.rows.length ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <>
          <DataTable
            rows={data.rows}
            rowKey={(row) => `${row.source}:${row.id}`}
            columns={columns}
            minWidth={1400}
            rowClassName={(row) =>
              row.status === "failed" || row.status === "cancelled"
                ? "opacity-60"
                : undefined
            }
          />
          <Pager
            page={page}
            pageSize={data.pageSize}
            count={data.count}
            onPage={setPage}
          />
        </>
      )}

      <PaymentDetailsModal
        row={selected}
        onClose={() => setSelected(null)}
        onChanged={reload}
      />
    </>
  );
}
