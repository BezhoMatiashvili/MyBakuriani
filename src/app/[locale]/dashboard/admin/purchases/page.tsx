"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import {
  PURCHASE_PERIODS,
  PURCHASE_SERVICES,
  type PurchasePeriod,
  type PurchaseService,
} from "@/lib/admin-purchases";
import { formatMoney } from "@/lib/finance/money";
import { formatDateTime, formatPhone } from "@/lib/utils/format";

type Totals = {
  purchases: number;
  buyers: number;
  gross: number;
  refunded: number;
  net: number;
};

type Customer = {
  id: string | null;
  name: string | null;
  phone: string | null;
  purchases: number;
  gross: number;
  refunded: number;
  net: number;
  services: string[];
  last_at: string;
};

type PurchaseRow = {
  id: string;
  created_at: string;
  customer_id: string | null;
  name: string | null;
  phone: string | null;
  service: string;
  amount: number;
  description: string | null;
  listing_title: string | null;
  organization_name: string | null;
  membership_status: string | null;
  refunded: number;
};

type Report = {
  page_size: number;
  total_rows: number;
  summary: Totals;
  totals: (Totals & { service: string })[];
  customers: Customer[];
  rows: PurchaseRow[];
};

const chip = (active: boolean) =>
  `min-h-[44px] rounded-xl px-4 text-[13px] font-bold transition-colors ${
    active
      ? "bg-[#0F172A] text-white"
      : "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]"
  }`;

const pill =
  "rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-bold text-[#475569]";

/**
 * Paid services customers bought from their balance (C42). Every figure comes
 * from admin_purchases_report() through /api/admin/purchases; wallet spend is
 * never called revenue here.
 */
export default function AdminPurchasesPage() {
  const t = useTranslations("AdminPurchases");
  const tStatus = useTranslations("AdminStatuses.periodStatuses");
  const tNav = useTranslations("DashboardSidebar.nav");
  const locale = useLocale();
  const [period, setPeriod] = useState<PurchasePeriod>("month");
  const [service, setService] = useState<PurchaseService | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const params = new URLSearchParams({ period, page: String(page) });
    if (service) params.set("service", service);
    if (query) params.set("q", query);
    fetch(`/api/admin/purchases?${params}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((payload) => {
        if (stale) return;
        if (!payload?.report) toast.error(t("loadError"));
        setReport(payload?.report ?? null);
        setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [period, service, query, page, t]);

  const when = (value: string) => formatDateTime(value, locale);
  const serviceLabel = (value: string) =>
    t.has(`services.${value}`) ? t(`services.${value}`) : value;
  const customerName = (id: string | null, name: string | null) =>
    id ? (
      <Link
        href={`/dashboard/admin/clients/${id}`}
        className="inline-flex min-h-[44px] items-center font-bold text-[#2563EB] underline"
      >
        {name ?? "—"}
      </Link>
    ) : (
      <span className="font-bold text-[#0F172A]">{name ?? "—"}</span>
    );

  const pageSize = report?.page_size ?? 50;
  const total = report?.total_rows ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 pb-10">
      <div className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="text-[14px] text-[#64748B]">{t("subtitle")}</p>
        <p className="text-[13px] text-[#64748B]">{t("note")}</p>
        <Link
          href="/dashboard/admin/payments"
          className="inline-flex min-h-[44px] items-center text-[13px] font-bold text-[#2563EB] underline"
        >
          {tNav("payments")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {PURCHASE_PERIODS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={period === item}
            onClick={() => {
              setPeriod(item);
              setPage(0);
            }}
            className={chip(period === item)}
          >
            {t(`periods.${item}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[null, ...PURCHASE_SERVICES].map((item) => (
          <button
            key={item ?? "all"}
            type="button"
            aria-pressed={service === item}
            onClick={() => {
              setService(item);
              setPage(0);
            }}
            className={chip(service === item)}
          >
            {item ? serviceLabel(item) : t("allServices")}
          </button>
        ))}
      </div>

      <AdminSearchInput
        value={search}
        onChange={setSearch}
        onClear={() => setSearch("")}
        placeholder={t("searchPlaceholder")}
        loading={loading && query !== ""}
      />

      {loading && !report ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : !report ? null : (
        <>
          <section className="space-y-3">
            <h2 className="text-[18px] font-black text-[#0F172A]">
              {t("byService")}
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-[#F8FAFC] text-[12px] font-bold text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3">{t("columns.service")}</th>
                    <th className="px-4 py-3 text-right">
                      {t("columns.purchases")}
                    </th>
                    <th className="px-4 py-3 text-right">
                      {t("columns.buyers")}
                    </th>
                    <th className="px-4 py-3 text-right">
                      {t("columns.spent")}
                    </th>
                    <th className="px-4 py-3 text-right">
                      {t("columns.refunded")}
                    </th>
                    <th className="px-4 py-3 text-right">{t("columns.net")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {report.totals.map((row) => (
                    <tr key={row.service}>
                      <td className="px-4 py-3 font-semibold">
                        {serviceLabel(row.service)}
                      </td>
                      <td className="px-4 py-3 text-right">{row.purchases}</td>
                      <td className="px-4 py-3 text-right">{row.buyers}</td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(row.gross)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(row.refunded)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {formatMoney(row.net)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#F8FAFC] font-black">
                    <td className="px-4 py-3">{t("total")}</td>
                    <td className="px-4 py-3 text-right">
                      {report.summary.purchases}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {report.summary.buyers}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(report.summary.gross)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(report.summary.refunded)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(report.summary.net)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[#94A3B8]">{t("netNote")}</p>
          </section>

          {report.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center text-[14px] text-[#94A3B8]">
              {service ? t("emptyService") : t("empty")}
            </p>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-[18px] font-black text-[#0F172A]">
                  {t("customersTitle")}
                </h2>
                <ul className="space-y-3">
                  {report.customers.map((customer) => (
                    <li
                      key={customer.id ?? "deleted"}
                      className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1 text-[13px]">
                          <p className="truncate">
                            {customerName(customer.id, customer.name)}
                          </p>
                          <p className="text-[#475569]">
                            {formatPhone(customer.phone)}
                          </p>
                          <p className="text-[12px] text-[#94A3B8]">
                            {t("lastAt", { date: when(customer.last_at) })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[18px] font-black text-[#0F172A]">
                            {formatMoney(customer.net)}
                          </p>
                          <p className="text-[12px] text-[#64748B]">
                            {t("columns.purchases")}: {customer.purchases}
                          </p>
                          {customer.refunded > 0 && (
                            <p className="text-[12px] font-bold text-[#B45309]">
                              {t("refundedLine", {
                                amount: formatMoney(customer.refunded),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {customer.services.map((item) => (
                          <span key={item} className={pill}>
                            {serviceLabel(item)}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-[18px] font-black text-[#0F172A]">
                  {t("rowsTitle")}
                </h2>
                <ul className="space-y-3">
                  {report.rows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1 text-[13px]">
                          <p className="truncate">
                            {customerName(row.customer_id, row.name)}
                            <span className="ml-2 text-[#64748B]">
                              {formatPhone(row.phone)}
                            </span>
                          </p>
                          <p className="break-words text-[#475569]">
                            {row.listing_title ??
                              row.organization_name ??
                              row.description ??
                              "—"}
                          </p>
                          <p className="text-[12px] text-[#94A3B8]">
                            {when(row.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[18px] font-black text-[#0F172A]">
                            {formatMoney(row.amount)}
                          </p>
                          {row.refunded > 0 && (
                            <p className="text-[12px] font-bold text-[#B45309]">
                              {t("refundedLine", {
                                amount: formatMoney(row.refunded),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={pill}>
                          {serviceLabel(row.service)}
                        </span>
                        {row.membership_status && (
                          <span className={pill}>
                            {tStatus.has(row.membership_status)
                              ? tStatus(row.membership_status)
                              : row.membership_status}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {total > pageSize && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="min-h-[44px] rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-bold disabled:opacity-40"
              >
                {t("prev")}
              </button>
              <span className="text-[13px] text-[#64748B]">
                {page + 1} / {Math.ceil(total / pageSize)}
              </span>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total || loading}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-[44px] rounded-xl border border-[#E2E8F0] px-4 text-[13px] font-bold disabled:opacity-40"
              >
                {t("next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
