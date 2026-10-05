"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiDateTime } from "@/lib/finance/filters";
import { formatMoney } from "@/lib/finance/money";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import AuditHistory from "@/components/admin/finance/AuditHistory";
import DataTable from "@/components/admin/finance/DataTable";
import DocumentUploadModal from "@/components/admin/finance/DocumentUploadModal";
import { ReasonModal } from "@/components/admin/finance/EntryModals";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import RegisterFilters, {
  useRegisterQuery,
} from "@/components/admin/finance/RegisterFilters";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Pager,
  Pill,
  Skeletons,
  linkClass,
  statusTone,
} from "@/components/admin/finance/ui";

// Primary documents archive (spec §12, C42): files in the private
// finance-documents bucket, opened through a 60-second signed link. Nothing
// is deleted; a wrong document is voided with a reason.

type DocumentRow = {
  id: string;
  document_no: number;
  doc_type: string;
  title: string;
  document_number: string | null;
  document_date: string | null;
  counterparty: string | null;
  amount: number | null;
  file_name: string;
  byte_size: number;
  status: string;
  void_reason: string | null;
  created_at: string;
  link: {
    kind: "entry" | "expense" | "invoice" | "payment" | "refund";
    id: string;
    label: string;
  } | null;
};

type ListPage = {
  rows: DocumentRow[];
  count: number;
  page: number;
  pageSize: number;
};

const BASE = "/dashboard/admin/finances";

function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Where a document's linked record can be found. */
function linkHref(link: NonNullable<DocumentRow["link"]>): string | null {
  const [code] = link.label.split(" · ");
  if (link.kind === "invoice") return `${BASE}/invoices/${link.id}`;
  if (link.kind === "entry")
    return `${BASE}/payments?q=${encodeURIComponent(code)}`;
  if (link.kind === "payment") {
    return `${BASE}/payments?q=${encodeURIComponent(link.label)}`;
  }
  if (link.kind === "expense") {
    const supplier = link.label.split(" · ")[1] ?? "";
    return `${BASE}/expenses?q=${encodeURIComponent(supplier)}`;
  }
  return null;
}

export default function DocumentsPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/documents?${query}`,
  );
  const [uploading, setUploading] = useState(false);
  const [voiding, setVoiding] = useState<DocumentRow | null>(null);

  return (
    <>
      <PageHeader
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        actions={
          <Button
            variant="primary"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => setUploading(true)}
          >
            {t("documents.upload")}
          </Button>
        }
      />

      <RegisterFilters
        selects={[
          {
            param: "category",
            label: t("filters.documentType"),
            options: DOCUMENT_TYPES.map((v) => ({
              value: v,
              label: t(`documentTypes.${v}`),
            })),
          },
          {
            param: "status",
            label: t("filters.status"),
            options: DOCUMENT_STATUSES.map((v) => ({
              value: v,
              label: t(`documentStatuses.${v}`),
            })),
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? t("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="documents" query={filterQuery} />
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
            rowKey={(row) => row.id}
            minWidth={1240}
            rowClassName={(row) =>
              row.status === "voided" ? "opacity-60" : undefined
            }
            columns={[
              {
                key: "id",
                header: t("columns.id"),
                className: "whitespace-nowrap",
                render: (row) => recordCode("DOC", row.document_no),
              },
              {
                key: "type",
                header: t("columns.documentType"),
                className: "whitespace-nowrap",
                render: (row) => t(`documentTypes.${row.doc_type}`),
              },
              {
                key: "title",
                header: t("columns.title"),
                className: "min-w-[180px]",
                render: (row) => (
                  <>
                    <span className="font-semibold">{row.title}</span>
                    {row.document_number && (
                      <span className="block text-[12px] text-[#64748B]">
                        № {row.document_number}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: "date",
                header: t("columns.documentDate"),
                className: "whitespace-nowrap",
                render: (row) => row.document_date ?? "—",
              },
              {
                key: "party",
                header: t("columns.counterparty"),
                className: "min-w-[140px]",
                render: (row) => row.counterparty ?? "—",
              },
              {
                key: "amount",
                header: t("columns.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) =>
                  row.amount === null ? "—" : formatMoney(row.amount),
              },
              {
                key: "link",
                header: t("columns.linkedRecord"),
                className: "min-w-[150px]",
                render: (row) => {
                  if (!row.link) return "—";
                  const href = linkHref(row.link);
                  const text = `${t(`links.${row.link.kind}`)}: ${row.link.label}`;
                  return href ? (
                    <Link href={href} className={linkClass}>
                      {text}
                    </Link>
                  ) : (
                    text
                  );
                },
              },
              {
                key: "file",
                header: t("columns.fileName"),
                className: "min-w-[160px]",
                render: (row) => (
                  <a
                    href={`/api/admin/finance/documents/${row.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${linkClass} break-all`}
                  >
                    {row.file_name}
                    <span className="ml-1 font-normal text-[#64748B]">
                      ({size(row.byte_size)})
                    </span>
                  </a>
                ),
              },
              {
                key: "uploaded",
                header: t("columns.uploaded"),
                className: "whitespace-nowrap",
                render: (row) => tbilisiDateTime(row.created_at),
              },
              {
                key: "status",
                header: t("columns.status"),
                className: "min-w-[120px]",
                render: (row) => (
                  <>
                    <Pill tone={statusTone(row.status)}>
                      {t(`documentStatuses.${row.status}`)}
                    </Pill>
                    {row.void_reason && (
                      <span className="mt-1 block text-[12px] text-[#64748B]">
                        {row.void_reason}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: "actions",
                header: t("columns.actions"),
                render: (row) => (
                  <span className="flex flex-wrap gap-1">
                    {row.status === "active" && (
                      <Button variant="ghost" onClick={() => setVoiding(row)}>
                        {t("documents.void")}
                      </Button>
                    )}
                    <AuditHistory table="finance_documents" id={row.id} />
                  </span>
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

      <DocumentUploadModal
        open={uploading}
        onClose={() => setUploading(false)}
        onUploaded={reload}
      />
      <ReasonModal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={t("documents.voidModal.title", {
          code: recordCode("DOC", voiding?.document_no),
        })}
        body={t("documents.voidModal.body")}
        label={t("common.reason")}
        confirmLabel={t("documents.void")}
        onConfirm={async (reason) => {
          const result = await financeRequest(
            `/api/admin/finance/documents/${voiding!.id}`,
            { method: "POST", json: { action: "void", reason } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("documents.voidModal.done"));
          reload();
          return null;
        }}
      />
    </>
  );
}
