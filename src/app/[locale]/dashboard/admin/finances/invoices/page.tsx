"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/shared/Modal";
import {
  INVOICE_DISPLAY_STATUSES,
  INVOICE_VIEWS,
  isOneOf,
} from "@/lib/finance/constants";
import { tbilisiDate } from "@/lib/finance/filters";
import { formatMoney } from "@/lib/finance/money";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import RegisterFilters, {
  useRegisterQuery,
} from "@/components/admin/finance/RegisterFilters";
import {
  Button,
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Pager,
  Pill,
  Skeletons,
  buttonClass,
  linkClass,
  statusTone,
} from "@/components/admin/finance/ui";

// Invoices (spec §15-20, C42): All / Unsent / Unpaid / Overdue / Templates,
// and New. An invoice is not revenue; the payment recorded against it is.

const BASE = "/dashboard/admin/finances/invoices";
const TABS = [...INVOICE_VIEWS, "templates"] as const;

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  display_status: string;
  issue_date: string | null;
  due_date: string | null;
  recipient_name: string | null;
  recipient_tax_id: string | null;
  total: number;
  net_paid: number;
  remaining: number;
  related_reference: string | null;
  sent_count: number;
  created_at: string;
  linked: string[];
};

type ListPage = {
  rows: InvoiceRow[];
  count: number;
  page: number;
  pageSize: number;
  totals: { total: number; paid: number; remaining: number };
};

type Template = {
  id: string;
  name: string;
  payload: { items?: unknown[]; recipient_name?: string };
  updated_at: string;
};

function Templates() {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { data, error, loading, reload } = useFinanceQuery<{
    rows: Template[];
  }>("/api/admin/finance/invoice-templates");
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Skeletons count={3} className="h-16" />;
  if (error) {
    return <ErrorState message={errorText(error.code)} onRetry={reload} />;
  }
  if (!data?.rows.length)
    return <EmptyState>{t("templates.empty")}</EmptyState>;

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-[#0F172A]">{row.name}</p>
              <p className="text-[12px] text-[#64748B]">
                {[
                  row.payload.recipient_name,
                  t("templates.items", {
                    count: row.payload.items?.length ?? 0,
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`${BASE}/new?template=${row.id}`}
                className={buttonClass("primary")}
              >
                {t("templates.use")}
              </Link>
              <Button variant="danger" onClick={() => setDeleting(row)}>
                {t("templates.delete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t("templates.delete")}
        size="sm"
      >
        <div className="space-y-4">
          <Notice tone="warning">
            {t("templates.confirmDelete", { name: deleting?.name ?? "" })}
          </Notice>
          <Button
            variant="danger"
            className="w-full"
            loading={busy}
            onClick={async () => {
              if (!deleting) return;
              setBusy(true);
              const result = await financeRequest(
                `/api/admin/finance/invoice-templates/${deleting.id}`,
                { method: "DELETE" },
              );
              setBusy(false);
              if (!result.ok) {
                toast.error(errorText(result.error.code));
                return;
              }
              toast.success(t("templates.deleted"));
              setDeleting(null);
              reload();
            }}
          >
            {tf("common.confirm")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Register({ view }: { view: (typeof INVOICE_VIEWS)[number] }) {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/invoices?${query}`,
  );
  const totals = data?.totals;
  const exportQuery = new URLSearchParams(filterQuery);
  exportQuery.set("view", view);

  return (
    <>
      <RegisterFilters
        selects={[
          {
            param: "status",
            label: tf("filters.status"),
            options: INVOICE_DISPLAY_STATUSES.map((v) => ({
              value: v,
              label: tf(`invoiceStatuses.${v}`),
            })),
          },
        ]}
        pickers={[
          { param: "payer", label: tf("filters.client"), kinds: ["client"] },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? tf("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="invoices" query={exportQuery.toString()} />
      </div>
      {loading && !data ? (
        <Skeletons count={4} className="h-12" />
      ) : error ? (
        <ErrorState message={errorText(error.code)} onRetry={reload} />
      ) : !data?.rows.length ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <>
          <DataTable
            rows={data.rows}
            rowKey={(row) => row.id}
            minWidth={1180}
            totalsLabel={tf("common.totals")}
            rowClassName={(row) =>
              row.status === "cancelled" ? "opacity-60" : undefined
            }
            columns={[
              {
                key: "number",
                header: tf("columns.invoiceNumber"),
                className: "whitespace-nowrap",
                render: (row) => (
                  <Link href={`${BASE}/${row.id}`} className={linkClass}>
                    {row.invoice_number ?? t("detail.draftTitle")}
                  </Link>
                ),
              },
              {
                key: "issued",
                header: tf("columns.date"),
                className: "whitespace-nowrap",
                render: (row) => row.issue_date ?? tbilisiDate(row.created_at),
              },
              {
                key: "due",
                header: tf("columns.dueDate"),
                className: "whitespace-nowrap",
                render: (row) => row.due_date ?? "—",
              },
              {
                key: "client",
                header: tf("columns.client"),
                className: "min-w-[160px]",
                render: (row) => (
                  <>
                    {row.recipient_name}
                    {row.recipient_tax_id && (
                      <span className="block text-[12px] text-[#64748B]">
                        {row.recipient_tax_id}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: "total",
                header: tf("columns.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.total),
                total: totals ? formatMoney(totals.total) : undefined,
              },
              {
                key: "paid",
                header: tf("columns.paid"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.net_paid),
                total: totals ? formatMoney(totals.paid) : undefined,
              },
              {
                key: "remaining",
                header: tf("columns.remaining"),
                align: "right",
                className: "whitespace-nowrap font-semibold",
                render: (row) =>
                  row.status === "issued" || row.status === "sent"
                    ? formatMoney(row.remaining)
                    : "—",
                total: totals ? formatMoney(totals.remaining) : undefined,
              },
              {
                key: "status",
                header: tf("columns.status"),
                render: (row) => (
                  <Pill tone={statusTone(row.display_status)}>
                    {tf(`invoiceStatuses.${row.display_status}`)}
                  </Pill>
                ),
              },
              {
                key: "linked",
                header: tf("columns.linkedTransaction"),
                className: "min-w-[120px]",
                render: (row) =>
                  row.linked.length ? row.linked.join(", ") : "—",
              },
              {
                key: "reference",
                header: tf("columns.relatedReference"),
                render: (row) => row.related_reference ?? "—",
              },
              {
                key: "pdf",
                header: tf("columns.pdf"),
                render: (row) => (
                  <a
                    href={`/api/admin/finance/invoices/${row.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {tf("common.view")}
                  </a>
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

export default function InvoicesPage() {
  const t = useTranslations("AdminInvoices");
  const { searchParams, update } = useRegisterQuery();
  const viewParam = searchParams.get("view");
  const tab = isOneOf(TABS, viewParam) ? viewParam : "all";

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Link href={`${BASE}/new`} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("new")}
          </Link>
        }
      />
      <Notice tone="neutral">{t("notRs")}</Notice>

      <div className="-mx-1 overflow-x-auto px-1" role="tablist">
        <div className="flex w-max gap-2">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => update({ view: item === "all" ? null : item })}
              className={`min-h-[44px] whitespace-nowrap rounded-xl px-4 text-[13px] font-bold transition-colors ${
                tab === item
                  ? "bg-[#0F172A] text-white"
                  : "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]"
              }`}
            >
              {t(`tabs.${item}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === "templates" ? <Templates /> : <Register view={tab} />}
    </>
  );
}
