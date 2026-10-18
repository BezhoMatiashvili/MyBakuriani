"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { paymentCode } from "@/lib/finance/constants";
import { tbilisiDateTime } from "@/lib/finance/filters";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import {
  Card,
  ErrorState,
  Notice,
  PageHeader,
  Pill,
  Skeletons,
  StatCard,
  ThresholdBar,
  buttonClass,
  levelTone,
  noticeLinkClass,
  statusTone,
} from "@/components/admin/finance/ui";

// Finance dashboard (spec §1, C42): cash-basis totals, the small-business
// and VAT thresholds, third-party money owed, unpaid invoices and wallet
// usage. Every number comes from /api/admin/finance/summary.

type Level = "ok" | "warning" | "exceeded";

type Summary = {
  today: string;
  year: number;
  month: {
    received: number;
    refunds: number;
    net: number;
    ownerShare: number;
    taxable: number;
    estimatedTax: number;
    rate: number;
  };
  ytd: {
    received: number;
    refunds: number;
    net: number;
    ownerShare: number;
    taxable: number;
    estimatedTax: number;
  };
  threshold: {
    amount: number;
    threshold: number;
    percent: number;
    remaining: number;
    level: Level;
    rate: number;
    highRate: number;
  };
  vat: {
    turnover: number;
    threshold: number;
    percent: number;
    remaining: number;
    level: Level;
    registered: boolean;
    rate: number;
  };
  owners: { outstanding: number; count: number };
  invoices: { unpaid: number; overdue: number; remaining: number };
  wallet: {
    usage: {
      revenue_type: string;
      purchases: number;
      refunds: number;
      net: number;
      purchase_count: number;
    }[];
    reconciliation: {
      difference: number;
      mismatched_wallets: number;
      other_credits: number;
    } | null;
  };
  recent: {
    id: string;
    source: string;
    entry_no: number | null;
    reference: string | null;
    occurred_at: string;
    payer_name: string | null;
    revenue_type: string | null;
    amount: number;
    status: string;
  }[];
  issuerComplete: boolean;
};

const BASE = "/dashboard/admin/finances";

export default function FinanceDashboardPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { data, error, loading, reload } = useFinanceQuery<Summary>(
    "/api/admin/finance/summary",
  );

  const header = (
    <PageHeader
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
    />
  );
  if (loading && !data) {
    return (
      <>
        {header}
        <Skeletons count={4} className="h-28" />
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        {header}
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      </>
    );
  }

  const monthFrom = `${data.today.slice(0, 7)}-01`;
  const { threshold, vat, wallet } = data;

  return (
    <>
      {header}

      {!data.issuerComplete && (
        <Notice tone="warning">
          {t("dashboard.issuerMissing")}{" "}
          <Link href={`${BASE}/settings`} className={noticeLinkClass}>
            {t("dashboard.openSettings")}
          </Link>
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dashboard.thisMonth")}
          value={formatMoney(data.month.net)}
          hint={t("dashboard.thisMonthHint", {
            received: formatMoney(data.month.received),
            refunds: formatMoney(data.month.refunds),
          })}
          href={`${BASE}/revenue?from=${monthFrom}&to=${data.today}`}
        />
        <StatCard
          label={t("dashboard.ytd")}
          value={formatMoney(data.ytd.net)}
          hint={t("dashboard.ytdHint", { year: data.year })}
          href={`${BASE}/revenue?from=${data.year}-01-01&to=${data.today}`}
        />
        <StatCard
          label={t("dashboard.taxable")}
          value={formatMoney(data.ytd.taxable)}
          hint={t("dashboard.taxableHint", { year: data.year })}
          href={`${BASE}/tax?year=${data.year}`}
        />
        <StatCard
          label={t("dashboard.estimatedTax")}
          value={formatMoney(data.ytd.estimatedTax)}
          hint={t("dashboard.estimatedTaxHint", { year: data.year })}
          href={`${BASE}/tax?year=${data.year}`}
        />
        <StatCard
          label={t("dashboard.threshold")}
          value={formatPercent(threshold.percent)}
          tone={levelTone(threshold.level)}
          badge={
            <Pill tone={levelTone(threshold.level)}>
              {t(`dashboard.levels.${threshold.level}`)}
            </Pill>
          }
          hint={
            <span className="block space-y-2">
              <ThresholdBar
                percent={threshold.percent}
                level={threshold.level}
                label={t("dashboard.threshold")}
              />
              <span className="block">
                {t("dashboard.thresholdHint", {
                  percent: formatPercent(threshold.percent),
                  remaining: formatMoney(threshold.remaining),
                })}
              </span>
            </span>
          }
          href={`${BASE}/threshold`}
        />
        <StatCard
          label={t("dashboard.vat")}
          value={formatMoney(vat.turnover)}
          tone={vat.registered ? "neutral" : levelTone(vat.level)}
          badge={
            vat.registered ? (
              <Pill tone="info">{t("vat.registered")}</Pill>
            ) : (
              <Pill tone={levelTone(vat.level)}>
                {t(`dashboard.levels.${vat.level}`)}
              </Pill>
            )
          }
          hint={t("dashboard.vatHint", {
            percent: formatPercent(vat.percent),
            threshold: formatMoney(vat.threshold),
          })}
          href={`${BASE}/vat`}
        />
        <StatCard
          label={t("dashboard.owners")}
          value={formatMoney(data.owners.outstanding)}
          hint={t("dashboard.ownersHint", { count: data.owners.count })}
          href={`${BASE}/owners`}
        />
        <StatCard
          label={t("dashboard.invoices")}
          value={formatMoney(data.invoices.remaining)}
          tone={data.invoices.overdue > 0 ? "warning" : "neutral"}
          hint={t("dashboard.invoicesHint", {
            count: data.invoices.unpaid,
            overdue: data.invoices.overdue,
          })}
          href={`${BASE}/invoices?view=unpaid`}
        />
      </div>

      <Notice tone="neutral">{t("disclaimers.tax")}</Notice>

      <Card
        title={t("dashboard.recentTitle")}
        actions={
          <Link href={`${BASE}/revenue`} className={buttonClass("ghost")}>
            {t("dashboard.viewAll")}
          </Link>
        }
      >
        {data.recent.length === 0 ? (
          <p className="text-[14px] text-[#94A3B8]">
            {t("dashboard.recentEmpty")}
          </p>
        ) : (
          <DataTable
            rows={data.recent}
            rowKey={(row) => `${row.source}:${row.id}`}
            minWidth={640}
            columns={[
              {
                key: "date",
                header: t("columns.dateTime"),
                className: "whitespace-nowrap",
                render: (row) => tbilisiDateTime(row.occurred_at),
              },
              {
                key: "id",
                header: t("columns.id"),
                className: "whitespace-nowrap",
                render: (row) => paymentCode(row),
              },
              {
                key: "client",
                header: t("columns.client"),
                render: (row) => row.payer_name ?? "—",
              },
              {
                key: "type",
                header: t("columns.revenueType"),
                render: (row) =>
                  row.revenue_type
                    ? t(`revenueTypes.${row.revenue_type}`)
                    : "—",
              },
              {
                key: "status",
                header: t("columns.status"),
                render: (row) => (
                  <Pill tone={statusTone(row.status)}>
                    {t(`paymentStatuses.${row.status}`)}
                  </Pill>
                ),
              },
              {
                key: "amount",
                header: t("columns.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.amount),
              },
            ]}
          />
        )}
      </Card>

      <Card
        title={t("dashboard.walletTitle")}
        description={t("disclaimers.wallet")}
      >
        {wallet.usage.length === 0 ? (
          <p className="text-[14px] text-[#94A3B8]">
            {t("dashboard.walletEmpty")}
          </p>
        ) : (
          <DataTable
            rows={wallet.usage}
            rowKey={(row) => row.revenue_type}
            minWidth={560}
            columns={[
              {
                key: "type",
                header: t("columns.revenueType"),
                render: (row) => t(`revenueTypes.${row.revenue_type}`),
              },
              {
                key: "count",
                header: t("columns.count"),
                align: "right",
                render: (row) => row.purchase_count,
              },
              {
                key: "purchases",
                header: t("columns.purchases"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.purchases),
              },
              {
                key: "refunds",
                header: t("columns.refunds"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.refunds),
              },
              {
                key: "net",
                header: t("columns.net"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.net),
              },
            ]}
          />
        )}
        {wallet.reconciliation && (
          <div className="mt-4 space-y-2">
            {wallet.reconciliation.difference === 0 &&
            wallet.reconciliation.mismatched_wallets === 0 ? (
              <Notice tone="success">{t("dashboard.reconcileOk")}</Notice>
            ) : (
              <Notice tone="warning">
                {t("dashboard.reconcileMismatch", {
                  difference: formatMoney(wallet.reconciliation.difference),
                  count: wallet.reconciliation.mismatched_wallets,
                })}
              </Notice>
            )}
            {wallet.reconciliation.other_credits > 0 && (
              <Notice tone="neutral">
                {t("dashboard.reconcileOther", {
                  amount: formatMoney(wallet.reconciliation.other_credits),
                })}
              </Notice>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
