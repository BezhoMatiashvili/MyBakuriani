"use client";

import { useTranslations } from "next-intl";
import DateField from "@/components/shared/DateField";
import { tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import { useRegisterQuery } from "@/components/admin/finance/RegisterFilters";
import {
  Card,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Pill,
  Skeletons,
  ThresholdBar,
  levelTone,
} from "@/components/admin/finance/ui";

// VAT watch (spec §10, C42): own income in the 12 calendar months ending
// with the chosen date's month against the registration threshold (Tax Code
// art. 165: apply within 2 working days once it is passed). Approximate, to
// be confirmed with an accountant.

type Vat = {
  asOf: string;
  windowStart: string;
  windowEnd: string;
  turnover: number;
  threshold: number;
  registered: boolean;
  rate: number;
  percent: number;
  remaining: number;
  level: "ok" | "warning" | "exceeded";
  months: {
    month: string;
    received: number;
    refunds: number;
    owner_share: number;
    taxable: number;
  }[];
};

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

export default function VatPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { searchParams, update } = useRegisterQuery();
  const today = tbilisiToday();
  const asOf = searchParams.get("as_of") ?? today;
  const { data, error, loading, reload } = useFinanceQuery<Vat>(
    `/api/admin/finance/vat?as_of=${encodeURIComponent(asOf)}`,
  );

  return (
    <>
      <PageHeader
        title={t("vatPage.title")}
        subtitle={t("vatPage.subtitle", {
          threshold: formatMoney(data?.threshold ?? 100000),
        })}
      />
      <Notice tone="warning">{t("disclaimers.vat")}</Notice>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t("exportPage.asOf")} className="w-[220px]">
          <DateField
            value={asOf}
            max={today}
            onChange={(value) => update({ as_of: value || null })}
          />
        </Field>
        <ExportButtons report="vat" query={`to=${asOf}`} />
      </div>

      {loading && !data ? (
        <Skeletons count={3} className="h-24" />
      ) : error || !data ? (
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      ) : (
        <>
          <Card
            title={t("vatPage.status")}
            description={t("vatPage.window", {
              from: data.windowStart,
              to: data.windowEnd,
            })}
            actions={
              data.registered ? (
                <Pill tone="info">{t("vat.registered")}</Pill>
              ) : (
                <Pill tone={levelTone(data.level)}>
                  {t("vat.notRegistered")}
                </Pill>
              )
            }
          >
            <div className="space-y-4">
              <p className="text-[32px] font-black tabular-nums tracking-[-0.6px] text-[#0F172A]">
                {formatMoney(data.turnover)}
              </p>
              <ThresholdBar
                percent={data.percent}
                level={data.level}
                label={t("vatPage.used")}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Figure
                  label={t("vatPage.threshold")}
                  value={formatMoney(data.threshold)}
                />
                <Figure
                  label={t("vatPage.used")}
                  value={formatPercent(data.percent)}
                />
                <Figure
                  label={t("vatPage.remaining")}
                  value={formatMoney(data.remaining)}
                />
              </div>
              {data.registered ? (
                <Notice tone="info">
                  {t("vatPage.registeredNote", {
                    rate: formatPercent(data.rate),
                  })}
                </Notice>
              ) : (
                <Notice tone={levelTone(data.level)}>
                  {data.level === "exceeded"
                    ? t("vatPage.exceeded")
                    : data.level === "warning"
                      ? t("vatPage.warning", {
                          percent: formatPercent(data.percent),
                        })
                      : t("vatPage.ok")}
                </Notice>
              )}
            </div>
          </Card>

          <Card title={t("vatPage.byMonth")}>
            <DataTable
              rows={data.months}
              rowKey={(row) => row.month}
              minWidth={600}
              totalsLabel={t("common.totals")}
              columns={[
                {
                  key: "month",
                  header: t("columns.month"),
                  className: "whitespace-nowrap font-semibold",
                  render: (row) => row.month.slice(0, 7),
                },
                {
                  key: "received",
                  header: t("columns.received"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatMoney(row.received),
                },
                {
                  key: "refunds",
                  header: t("columns.refunds"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatMoney(row.refunds),
                },
                {
                  key: "owner",
                  header: t("columns.thirdParty"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatMoney(row.owner_share),
                },
                {
                  key: "turnover",
                  header: t("columns.turnover"),
                  align: "right",
                  className: "whitespace-nowrap font-semibold",
                  render: (row) => formatMoney(row.taxable),
                  total: formatMoney(data.turnover),
                },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
