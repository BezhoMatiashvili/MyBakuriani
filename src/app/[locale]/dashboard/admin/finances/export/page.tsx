"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import DateField from "@/components/shared/DateField";
import { REPORT_KEYS, type ReportKey } from "@/lib/finance/constants";
import { addDays, monthStart, tbilisiToday } from "@/lib/finance/filters";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import { yearOptions } from "@/components/admin/finance/tax";
import {
  Card,
  Field,
  Notice,
  PageHeader,
  Select,
} from "@/components/admin/finance/ui";

// Export centre (spec §13, C42): every register and report as Excel, CSV or
// PDF — in Georgian — for one period. Each register page also exports its
// own filtered view.

export default function ExportPage() {
  const t = useTranslations("AdminFinances");
  const today = tbilisiToday();
  const lastMonthEnd = addDays(monthStart(today), -1);
  const [from, setFrom] = useState(monthStart(lastMonthEnd));
  const [to, setTo] = useState(lastMonthEnd);
  const [year, setYear] = useState(today.slice(0, 4));
  const [asOf, setAsOf] = useState(today);

  function queryFor(report: ReportKey): string {
    if (report === "tax") return `year=${year}`;
    if (report === "vat") return `to=${asOf}`;
    if (report === "owners") return "";
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }

  function detail(report: ReportKey): string {
    if (report === "tax") return t("export.year", { year });
    if (report === "vat") return `${t("exportPage.asOf")}: ${asOf}`;
    if (report === "owners") return "";
    return from || to
      ? t("export.period", { from: from || "…", to: to || "…" })
      : t("export.allTime");
  }

  return (
    <>
      <PageHeader
        title={t("exportPage.title")}
        subtitle={t("exportPage.subtitle")}
      />
      <Notice tone="info">{t("exportPage.language")}</Notice>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("filters.from")}>
            <DateField
              value={from}
              max={to || today}
              clearable
              onChange={setFrom}
            />
          </Field>
          <Field label={t("filters.to")}>
            <DateField
              value={to}
              min={from || undefined}
              max={today}
              clearable
              onChange={setTo}
            />
          </Field>
          <Field label={t("exportPage.year")} htmlFor="export-year">
            <Select
              id="export-year"
              value={year}
              onChange={setYear}
              options={yearOptions(today).map((y) => ({ value: y, label: y }))}
            />
          </Field>
          <Field label={t("exportPage.asOf")}>
            <DateField value={asOf} max={today} onChange={setAsOf} />
          </Field>
        </div>
      </Card>

      <ul className="grid gap-4 lg:grid-cols-2">
        {REPORT_KEYS.map((report) => (
          <li
            key={report}
            className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
          >
            <div className="space-y-1">
              <h2 className="text-[16px] font-bold text-[#0F172A]">
                {t(`reports.${report}`)}
              </h2>
              <p className="text-[13px] leading-[20px] text-[#64748B]">
                {t(`exportPage.hints.${report}`)}
              </p>
              {detail(report) && (
                <p className="text-[12px] font-semibold text-[#475569]">
                  {detail(report)}
                </p>
              )}
            </div>
            <ExportButtons report={report} query={queryFor(report)} />
          </li>
        ))}
      </ul>
    </>
  );
}
