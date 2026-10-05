"use client";

import { useTranslations } from "next-intl";
import { tbilisiToday } from "@/lib/finance/filters";
import {
  formatMoney,
  formatPercent,
  thresholdStatus,
} from "@/lib/finance/money";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import { useRegisterQuery } from "@/components/admin/finance/RegisterFilters";
import { yearOptions, type TaxYear } from "@/components/admin/finance/tax";
import {
  Card,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Pill,
  Select,
  Skeletons,
  ThresholdBar,
  levelTone,
} from "@/components/admin/finance/ui";

// Small-business threshold monitor (spec §9, C42): the calendar year's
// taxable income so far against the threshold (Tax Code art. 90), with the
// month it was passed — from that month to year end the higher rate applies.

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F8FAFC] p-3">
      <p className="text-[12px] font-semibold text-[#64748B]">{label}</p>
      <p className="mt-1 text-[18px] font-black tabular-nums text-[#0F172A]">
        {value}
      </p>
    </div>
  );
}

export default function ThresholdPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { searchParams, update } = useRegisterQuery();
  const today = tbilisiToday();
  const year = searchParams.get("year") ?? today.slice(0, 4);
  const { data, error, loading, reload } = useFinanceQuery<TaxYear>(
    `/api/admin/finance/tax?year=${encodeURIComponent(year)}`,
  );

  const header = (
    <PageHeader
      title={t("threshold.title")}
      subtitle={t("threshold.subtitle", { year })}
    />
  );
  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Field
        label={t("tax.year")}
        htmlFor="threshold-year"
        className="w-[160px]"
      >
        <Select
          id="threshold-year"
          value={year}
          onChange={(value) => update({ year: value })}
          options={yearOptions(today).map((y) => ({ value: y, label: y }))}
        />
      </Field>
      <ExportButtons report="tax" query={`year=${year}`} />
    </div>
  );

  if (loading && !data) {
    return (
      <>
        {header}
        {controls}
        <Skeletons count={3} className="h-24" />
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        {header}
        {controls}
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      </>
    );
  }

  const { settings } = data;
  const thisMonth = data.today.slice(0, 7);
  const elapsed = data.rows.filter((row) => row.month.slice(0, 7) <= thisMonth);
  const current = elapsed[elapsed.length - 1];
  const amount = current?.cumulative_taxable ?? 0;
  const status = thresholdStatus(
    amount,
    settings.threshold,
    settings.warnPercent,
  );
  const crossing = data.rows.find(
    (row) => row.cumulative_taxable > settings.threshold,
  );
  const tone = levelTone(status.level);

  return (
    <>
      {header}
      {controls}

      <Card
        title={t("threshold.income")}
        actions={
          <Pill tone={tone}>{t(`dashboard.levels.${status.level}`)}</Pill>
        }
      >
        <div className="space-y-4">
          <p className="text-[32px] font-black tabular-nums tracking-[-0.6px] text-[#0F172A]">
            {formatMoney(amount)}
          </p>
          <ThresholdBar
            percent={status.percent}
            level={status.level}
            label={t("threshold.used")}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              label={t("threshold.limit")}
              value={formatMoney(settings.threshold)}
            />
            <Figure
              label={t("threshold.used")}
              value={formatPercent(status.percent)}
            />
            <Figure
              label={t("threshold.remaining")}
              value={formatMoney(status.remaining)}
            />
            <Figure
              label={t("threshold.rateNow")}
              value={formatPercent(current?.rate ?? settings.rate)}
            />
          </div>
          <Notice tone={tone}>
            {status.level === "exceeded" && crossing
              ? t("threshold.exceeded", {
                  month: crossing.month.slice(0, 7),
                  high: formatPercent(settings.highRate),
                })
              : status.level === "warning"
                ? t("threshold.warning", {
                    percent: formatPercent(status.percent),
                    high: formatPercent(settings.highRate),
                  })
                : t("threshold.ok")}
          </Notice>
        </div>
      </Card>

      <Card title={t("threshold.byMonth")}>
        <DataTable
          rows={data.rows}
          rowKey={(row) => row.month}
          minWidth={560}
          rowClassName={(row) =>
            crossing?.month === row.month
              ? "bg-[#FEF2F2]"
              : row.month.slice(0, 7) > thisMonth
                ? "text-[#94A3B8]"
                : undefined
          }
          columns={[
            {
              key: "month",
              header: t("columns.month"),
              className: "whitespace-nowrap font-semibold",
              render: (row) => row.month.slice(0, 7),
            },
            {
              key: "taxable",
              header: t("columns.taxable"),
              align: "right",
              className: "whitespace-nowrap",
              render: (row) => formatMoney(row.taxable),
            },
            {
              key: "cumulative",
              header: t("columns.cumulative"),
              align: "right",
              className: "whitespace-nowrap font-semibold",
              render: (row) => formatMoney(row.cumulative_taxable),
            },
            {
              key: "rate",
              header: t("columns.rate"),
              align: "right",
              render: (row) => formatPercent(row.rate),
            },
          ]}
        />
      </Card>
      <Notice tone="neutral">{t("disclaimers.tax")}</Notice>
    </>
  );
}
