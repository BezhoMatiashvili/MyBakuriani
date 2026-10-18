"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  estimateTax,
  formatMoney,
  formatPercent,
  parseMoney,
  roundMoney,
} from "@/lib/finance/money";
import { tbilisiToday } from "@/lib/finance/filters";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import { useRegisterQuery } from "@/components/admin/finance/RegisterFilters";
import {
  sumMoney,
  yearOptions,
  type TaxMonth,
  type TaxYear,
} from "@/components/admin/finance/tax";
import {
  Card,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Select,
  Skeletons,
  inputClass,
} from "@/components/admin/finance/ui";

// Tax period report (spec §7) and the informational calculator (spec §8):
// per Tbilisi month, money received, refunds, adjustments, third-party money
// and the taxable own income, with the small-business estimate (Tax Code
// art. 90: the higher rate from the start of the month the year's income
// passes the threshold). Not an RS declaration.

function Calculator({ data }: { data: TaxYear }) {
  const t = useTranslations("AdminFinances");
  const months = data.rows.filter(
    (row) => row.month.slice(0, 7) <= data.today.slice(0, 7),
  );
  const latest = months[months.length - 1] ?? data.rows[0];
  const [base, setBase] = useState<"month" | "year" | "custom">("month");
  const [month, setMonth] = useState(latest?.month ?? "");
  const [custom, setCustom] = useState("");
  const selected = data.rows.find((row) => row.month === month);
  const yearTaxable = sumMoney(data.rows.map((row) => row.taxable));
  const defaultRate =
    base === "month" && selected ? selected.rate : data.settings.rate;
  const [rate, setRate] = useState<string | null>(null);
  const rateValue = parseMoney(rate ?? String(defaultRate));
  const amount =
    base === "month"
      ? (selected?.taxable ?? 0)
      : base === "year"
        ? yearTaxable
        : (parseMoney(custom) ?? 0);
  const result =
    rateValue === null ? null : estimateTax(Math.max(amount, 0), rateValue);
  const byMonths = sumMoney(data.rows.map((row) => row.estimated_tax));

  return (
    <Card title={t("tax.calculator.title")} description={t("disclaimers.tax")}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("tax.calculator.base")} htmlFor="calc-base">
          <Select
            id="calc-base"
            value={base}
            onChange={(value) => {
              setBase(value as typeof base);
              setRate(null);
            }}
            options={[
              { value: "month", label: t("tax.calculator.baseMonth") },
              { value: "year", label: t("tax.calculator.baseYear") },
              { value: "custom", label: t("tax.calculator.baseCustom") },
            ]}
          />
        </Field>
        {base === "month" && (
          <Field label={t("tax.calculator.baseMonth")} htmlFor="calc-month">
            <Select
              id="calc-month"
              value={month}
              onChange={(value) => {
                setMonth(value);
                setRate(null);
              }}
              options={data.rows.map((row) => ({
                value: row.month,
                label: row.month.slice(0, 7),
              }))}
            />
          </Field>
        )}
        {base === "custom" ? (
          <Field label={t("tax.calculator.amount")} htmlFor="calc-amount">
            <input
              id="calc-amount"
              inputMode="decimal"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className={inputClass}
            />
          </Field>
        ) : (
          <Field label={t("tax.calculator.amount")}>
            <p className="flex min-h-[44px] items-center rounded-xl bg-[#F8FAFC] px-3 text-[14px] font-semibold tabular-nums text-[#0F172A]">
              {formatMoney(amount)}
            </p>
          </Field>
        )}
        <Field label={t("tax.calculator.rate")} htmlFor="calc-rate">
          <input
            id="calc-rate"
            inputMode="decimal"
            value={rate ?? String(defaultRate)}
            onChange={(event) => setRate(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-[#F8FAFC] p-4">
        <div>
          <p className="text-[13px] font-semibold text-[#64748B]">
            {t("tax.calculator.result")}
          </p>
          <p className="text-[26px] font-black tabular-nums text-[#0F172A]">
            {result === null ? "—" : formatMoney(result)}
          </p>
        </div>
        <p className="text-[13px] text-[#64748B]">
          {t("tax.calculator.byMonths", { amount: formatMoney(byMonths) })}
        </p>
      </div>
    </Card>
  );
}

export default function TaxPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { searchParams, update } = useRegisterQuery();
  const today = tbilisiToday();
  const year = searchParams.get("year") ?? today.slice(0, 4);
  const { data, error, loading, reload } = useFinanceQuery<TaxYear>(
    `/api/admin/finance/tax?year=${encodeURIComponent(year)}`,
  );

  const totals = useMemo(() => {
    const rows = data?.rows ?? [];
    const pick = (key: keyof TaxMonth) =>
      sumMoney(rows.map((row) => row[key] as number));
    return {
      received: pick("received"),
      refunds: pick("refunds"),
      adjustments: pick("adjustments"),
      net: pick("net"),
      owner: pick("owner_share"),
      platform: pick("platform_revenue"),
      other: pick("other_income"),
      taxable: pick("taxable"),
      tax: roundMoney(pick("estimated_tax")),
    };
  }, [data]);

  const settings = data?.settings;
  return (
    <>
      <PageHeader
        title={t("tax.title")}
        subtitle={
          settings
            ? t("tax.subtitle", {
                rate: formatPercent(settings.rate),
                threshold: formatMoney(settings.threshold),
                high: formatPercent(settings.highRate),
              })
            : undefined
        }
      />
      <Notice tone="warning">{t("disclaimers.tax")}</Notice>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t("tax.year")} htmlFor="tax-year" className="w-[160px]">
          <Select
            id="tax-year"
            value={year}
            onChange={(value) => update({ year: value })}
            options={yearOptions(today).map((y) => ({ value: y, label: y }))}
          />
        </Field>
        <ExportButtons report="tax" query={`year=${year}`} />
      </div>

      {loading && !data ? (
        <Skeletons count={6} className="h-10" />
      ) : error || !data ? (
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      ) : (
        <>
          <DataTable
            rows={data.rows}
            rowKey={(row) => row.month}
            minWidth={1200}
            totalsLabel={t("common.totals")}
            rowClassName={(row) =>
              row.month.slice(0, 7) > data.today.slice(0, 7)
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
              ...(
                [
                  ["received", "columns.received", totals.received],
                  ["refunds", "columns.refunds", totals.refunds],
                  ["adjustments", "columns.adjustments", totals.adjustments],
                  ["net", "columns.net", totals.net],
                  ["owner_share", "columns.thirdParty", totals.owner],
                  ["platform_revenue", "columns.own", totals.platform],
                  ["other_income", "columns.otherOwn", totals.other],
                  ["taxable", "columns.taxable", totals.taxable],
                ] as const
              ).map(([key, header, total]) => ({
                key,
                header: t(header),
                align: "right" as const,
                className: "whitespace-nowrap",
                render: (row: TaxMonth) => formatMoney(row[key]),
                total: formatMoney(total),
              })),
              {
                key: "cumulative",
                header: t("columns.cumulative"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.cumulative_taxable),
              },
              {
                key: "rate",
                header: t("columns.rate"),
                align: "right",
                render: (row) => formatPercent(row.rate),
              },
              {
                key: "tax",
                header: t("columns.estimatedTax"),
                align: "right",
                className: "whitespace-nowrap font-semibold",
                render: (row) => formatMoney(row.estimated_tax),
                total: formatMoney(totals.tax),
              },
            ]}
          />
          <Calculator key={data.year} data={data} />
        </>
      )}
    </>
  );
}
