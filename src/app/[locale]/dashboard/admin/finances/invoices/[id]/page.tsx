"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import Modal from "@/components/shared/Modal";
import {
  INVOICE_SHARE_DAYS,
  paymentCode,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiDate, tbilisiDateTime } from "@/lib/finance/filters";
import { formatMoney, formatPercent } from "@/lib/finance/money";
import {
  downloadFile,
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import AuditHistory from "@/components/admin/finance/AuditHistory";
import DataTable from "@/components/admin/finance/DataTable";
import DocumentUploadModal from "@/components/admin/finance/DocumentUploadModal";
import {
  IncomeModal,
  ReasonModal,
} from "@/components/admin/finance/EntryModals";
import type { PaymentRow } from "@/components/admin/finance/PaymentDetails";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Pill,
  Skeletons,
  buttonClass,
  inputClass,
  linkClass,
  statusTone,
} from "@/components/admin/finance/ui";

// One invoice (spec §16-18, C42): its PDF, delivery (e-mail with a secure
// link, a link to share, or "sent" by hand), the money recorded against it,
// its archived documents and audit history. Issued content never changes.

const BASE = "/dashboard/admin/finances/invoices";

type Issuer = {
  legal_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_iban?: string | null;
  bank_swift?: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  status: "draft" | "issued" | "sent" | "cancelled";
  display_status: string;
  issue_date: string | null;
  due_date: string | null;
  issuer: Issuer | null;
  recipient_type: string;
  recipient_name: string;
  recipient_tax_id: string | null;
  recipient_address: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_profile_id: string | null;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
  subtotal: number;
  discount_amount: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  payment_method: string | null;
  payment_id: string | null;
  related_reference: string | null;
  notes: string | null;
  terms: string | null;
  has_share_link: boolean;
  share_expires_at: string | null;
  sent_at: string | null;
  sent_count: number;
  last_sent_to: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  net_paid: number;
  remaining: number;
};

type DocumentRow = {
  id: string;
  document_no: number;
  doc_type: string;
  title: string;
  file_name: string;
  status: string;
  created_at: string;
};

type Detail = {
  invoice: Invoice;
  payments: PaymentRow[];
  documents: DocumentRow[];
};

type Dialog =
  | "issue"
  | "send"
  | "share"
  | "markSent"
  | "payment"
  | "link"
  | "cancel"
  | "document";

function Party({
  title,
  lines,
}: {
  title: string;
  lines: (string | null | undefined)[];
}) {
  const shown = lines.filter(Boolean);
  return (
    <div className="min-w-0 rounded-xl bg-[#F8FAFC] p-4">
      <p className="text-[12px] font-bold text-[#2563EB]">{title}</p>
      {shown.length ? (
        shown.map((line, index) => (
          <p
            key={index}
            className={
              index === 0
                ? "mt-1 break-words text-[15px] font-bold text-[#0F172A]"
                : "break-words text-[13px] text-[#475569]"
            }
          >
            {line}
          </p>
        ))
      ) : (
        <p className="mt-1 text-[13px] text-[#94A3B8]">—</p>
      )}
    </div>
  );
}

function SendDialog({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminInvoices");
  const errorText = useErrorText();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTo(invoice.recipient_email ?? "");
      setProblem(null);
    }
  }, [open, invoice.recipient_email]);
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("detail.sendModal.title")}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const result = await financeRequest<{ sent_to: string }>(
            `/api/admin/finance/invoices/${invoice.id}`,
            { method: "POST", json: { action: "send", to } },
          );
          setBusy(false);
          if (!result.ok) {
            setProblem(errorText(result.error.code));
            return;
          }
          toast.success(
            t("detail.sendModal.sent", { to: result.data.sent_to }),
          );
          onDone();
          onClose();
        }}
      >
        <Notice tone="info">
          {t("detail.sendModal.body", { days: INVOICE_SHARE_DAYS })}
        </Notice>
        <Field label={t("detail.sendModal.to")} htmlFor="send-to">
          <input
            id="send-to"
            type="email"
            required
            maxLength={200}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={inputClass}
          />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!to.trim()}
        >
          {t("detail.send")}
        </Button>
      </form>
    </Modal>
  );
}

function ShareDialog({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<"share" | "unshare" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setLink(null);
      setProblem(null);
    }
  }, [open]);

  async function act(action: "share" | "unshare") {
    setBusy(action);
    setProblem(null);
    const result = await financeRequest<{ url: string; expires_at: string }>(
      `/api/admin/finance/invoices/${invoice.id}`,
      { method: "POST", json: { action } },
    );
    setBusy(null);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    if (action === "share") {
      setLink(result.data);
      toast.success(t("detail.shareModal.created"));
    } else {
      setLink(null);
      toast.success(t("detail.shareModal.revoked"));
    }
    onDone();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("detail.shareModal.title")}
      size="md"
    >
      <div className="space-y-4">
        {link ? (
          <>
            <Notice tone="success">
              {t("detail.shareModal.active", {
                date: tbilisiDate(link.expires_at),
              })}
            </Notice>
            <div className="flex gap-2">
              <input
                readOnly
                value={link.url}
                aria-label={t("detail.share")}
                onFocus={(event) => event.target.select()}
                className={`${inputClass} font-mono text-[12px]`}
              />
              <Button
                icon={<Copy className="h-4 w-4" aria-hidden />}
                onClick={async () => {
                  await navigator.clipboard
                    .writeText(link.url)
                    .catch(() => null);
                  toast.success(tf("common.copied"));
                }}
              >
                {tf("common.copy")}
              </Button>
            </div>
          </>
        ) : invoice.has_share_link && invoice.share_expires_at ? (
          <Notice tone="info">
            {t("detail.shareModal.hasLink", {
              date: tbilisiDate(invoice.share_expires_at),
            })}
          </Notice>
        ) : (
          <Notice tone="neutral">{t("detail.shareModal.none")}</Notice>
        )}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={busy === "share"}
            onClick={() => act("share")}
          >
            {invoice.has_share_link || link
              ? t("detail.shareModal.renew")
              : t("detail.shareModal.create")}
          </Button>
          {(invoice.has_share_link || link) && (
            <Button
              variant="danger"
              loading={busy === "unshare"}
              onClick={() => act("unshare")}
            >
              {t("detail.shareModal.revoke")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MarkSentDialog({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminInvoices");
  const errorText = useErrorText();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTo(invoice.recipient_email ?? invoice.recipient_phone ?? "");
      setProblem(null);
    }
  }, [open, invoice.recipient_email, invoice.recipient_phone]);
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("detail.markSentModal.title")}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const result = await financeRequest(
            `/api/admin/finance/invoices/${invoice.id}`,
            { method: "POST", json: { action: "mark_sent", to } },
          );
          setBusy(false);
          if (!result.ok) {
            setProblem(errorText(result.error.code));
            return;
          }
          toast.success(t("detail.markSentModal.done"));
          onDone();
          onClose();
        }}
      >
        <Field label={t("detail.markSentModal.to")} htmlFor="mark-to">
          <input
            id="mark-to"
            required
            maxLength={320}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={inputClass}
          />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!to.trim()}
        >
          {t("detail.markSent")}
        </Button>
      </form>
    </Modal>
  );
}

function LinkPaymentDialog({
  invoice,
  open,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { data, loading } = useFinanceQuery<{ rows: PaymentRow[] }>(
    open ? "/api/admin/finance/payments?view=journal&source=keepz" : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) setProblem(null);
  }, [open]);
  const candidates = (data?.rows ?? []).filter(
    (row) => !row.invoice_id && row.status === "completed",
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("detail.linkModal.title")}
      size="md"
    >
      <div className="space-y-4">
        <Notice tone="info">{t("detail.linkModal.hint")}</Notice>
        {loading && !data ? (
          <Skeletons count={3} className="h-12" />
        ) : candidates.length === 0 ? (
          <EmptyState>{t("detail.linkModal.empty")}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {candidates.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] p-3"
              >
                <div className="min-w-0 text-[13px]">
                  <p className="font-bold text-[#0F172A]">
                    {formatMoney(row.amount)} · {paymentCode(row)}
                  </p>
                  <p className="text-[#64748B]">
                    {tbilisiDateTime(row.occurred_at)} · {row.payer_name ?? "—"}
                    {row.revenue_type &&
                      ` · ${tf(`revenueTypes.${row.revenue_type}`)}`}
                  </p>
                </div>
                <Button
                  loading={busy === row.id}
                  disabled={busy !== null && busy !== row.id}
                  onClick={async () => {
                    setBusy(row.id);
                    const result = await financeRequest(
                      `/api/admin/finance/invoices/${invoice.id}`,
                      {
                        method: "POST",
                        json: { action: "link_payment", payment_id: row.id },
                      },
                    );
                    setBusy(null);
                    if (!result.ok) {
                      setProblem(errorText(result.error.code));
                      return;
                    }
                    toast.success(t("detail.linkModal.done"));
                    onDone();
                    onClose();
                  }}
                >
                  {t("detail.linkModal.link")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {problem && <Notice tone="danger">{problem}</Notice>}
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}>{children}</Card>;
}

export default function InvoiceDetailPage() {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useFinanceQuery<Detail>(
    `/api/admin/finance/invoices/${id}`,
  );
  const draftIssuer = useFinanceQuery<
    Issuer & { legal_address?: string | null }
  >(data?.invoice.status === "draft" ? "/api/admin/finance/settings" : null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) {
    return <Skeletons count={4} className="h-32" />;
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title={t("title")} />
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      </>
    );
  }

  const { invoice, payments, documents } = data;
  const draft = invoice.status === "draft";
  const live = invoice.status === "issued" || invoice.status === "sent";
  const cancelled = invoice.status === "cancelled";
  const archived = documents.some(
    (d) => d.doc_type === "invoice" && d.status === "active",
  );
  const issuer: Issuer =
    invoice.issuer ??
    (draftIssuer.data
      ? { ...draftIssuer.data, address: draftIssuer.data.legal_address ?? null }
      : {});
  const pdfUrl = `/api/admin/finance/invoices/${invoice.id}/pdf`;

  async function action(name: string, body: Record<string, unknown> = {}) {
    setBusy(name);
    const result = await financeRequest<Record<string, unknown>>(
      `/api/admin/finance/invoices/${invoice.id}`,
      { method: "POST", json: { action: name, ...body } },
    );
    setBusy(null);
    if (!result.ok) {
      toast.error(errorText(result.error.code));
      return null;
    }
    return result.data;
  }

  return (
    <>
      <PageHeader
        title={invoice.invoice_number ?? t("detail.draftTitle")}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={statusTone(invoice.display_status)}>
              {tf(`invoiceStatuses.${invoice.display_status}`)}
            </Pill>
            {invoice.issue_date && (
              <span>{t("detail.issuedOn", { date: invoice.issue_date })}</span>
            )}
            {invoice.due_date && (
              <span>{t("detail.due", { date: invoice.due_date })}</span>
            )}
          </span>
        }
        actions={
          <Link href={BASE} className={buttonClass()}>
            {tf("common.back")}
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {draft && (
          <>
            <Link href={`${BASE}/${invoice.id}/edit`} className={buttonClass()}>
              {t("detail.edit")}
            </Link>
            <Button variant="primary" onClick={() => setDialog("issue")}>
              {t("detail.issue")}
            </Button>
          </>
        )}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass()}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t("detail.viewPdf")}
        </a>
        {!draft && (
          <Button
            icon={<Download className="h-4 w-4" aria-hidden />}
            loading={busy === "download"}
            onClick={async () => {
              setBusy("download");
              const failure = await downloadFile(`${pdfUrl}?download=1`);
              setBusy(null);
              if (failure) toast.error(errorText(failure.code));
            }}
          >
            {t("detail.downloadPdf")}
          </Button>
        )}
        {live && (
          <>
            <Button variant="primary" onClick={() => setDialog("send")}>
              {invoice.sent_count > 0 ? t("detail.resend") : t("detail.send")}
            </Button>
            <Button onClick={() => setDialog("share")}>
              {t("detail.share")}
            </Button>
            {invoice.status === "issued" && (
              <Button onClick={() => setDialog("markSent")}>
                {t("detail.markSent")}
              </Button>
            )}
            {invoice.remaining > 0 && (
              <>
                <Button onClick={() => setDialog("payment")}>
                  {t("detail.recordPayment")}
                </Button>
                {!invoice.payment_id && (
                  <Button onClick={() => setDialog("link")}>
                    {t("detail.linkKeepz")}
                  </Button>
                )}
              </>
            )}
            {!archived && (
              <Button
                loading={busy === "archive_pdf"}
                onClick={async () => {
                  const result = await action("archive_pdf");
                  if (result) {
                    toast.success(t("detail.archivedToast"));
                    reload();
                  }
                }}
              >
                {t("detail.archivePdf")}
              </Button>
            )}
          </>
        )}
        {!draft && (
          <Button onClick={() => setDialog("document")}>
            {t("detail.attach")}
          </Button>
        )}
        <Button
          loading={busy === "duplicate"}
          onClick={async () => {
            const result = await action("duplicate");
            if (result?.id) {
              toast.success(t("detail.duplicated"));
              router.push(`${BASE}/${result.id as string}`);
            }
          }}
        >
          {t("detail.duplicate")}
        </Button>
        {!cancelled && (
          <Button variant="danger" onClick={() => setDialog("cancel")}>
            {t("detail.cancelInvoice")}
          </Button>
        )}
        <AuditHistory table="invoices" id={invoice.id} />
      </div>

      {cancelled && (
        <Notice tone="warning">
          {t("detail.sections.cancelled", {
            date: invoice.cancelled_at ? tbilisiDate(invoice.cancelled_at) : "",
            reason: invoice.cancel_reason ?? "",
          })}
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Section title={t("detail.sections.parties")}>
            {draft && (
              <Notice tone="neutral" className="mb-3">
                {t("detail.sections.draftIssuerNote")}
              </Notice>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Party
                title={t("detail.sections.issuer")}
                lines={[
                  issuer.legal_name,
                  issuer.tax_id,
                  issuer.address,
                  [issuer.email, issuer.phone].filter(Boolean).join(" · "),
                  [issuer.bank_name, issuer.bank_iban, issuer.bank_swift]
                    .filter(Boolean)
                    .join(" · "),
                ]}
              />
              <Party
                title={t("detail.sections.recipient")}
                lines={[
                  invoice.recipient_name,
                  invoice.recipient_tax_id,
                  invoice.recipient_address,
                  [invoice.recipient_email, invoice.recipient_phone]
                    .filter(Boolean)
                    .join(" · "),
                ]}
              />
            </div>
          </Section>

          <Section title={t("detail.sections.items")}>
            <DataTable
              rows={invoice.items.map((item, index) => ({ ...item, index }))}
              rowKey={(row) => String(row.index)}
              minWidth={520}
              columns={[
                {
                  key: "n",
                  header: "#",
                  render: (row) => row.index + 1,
                },
                {
                  key: "description",
                  header: t("form.description"),
                  className: "min-w-[200px]",
                  render: (row) => row.description,
                },
                {
                  key: "quantity",
                  header: t("form.quantity"),
                  align: "right",
                  render: (row) => row.quantity,
                },
                {
                  key: "price",
                  header: t("form.unitPrice"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatMoney(row.unit_price),
                },
                {
                  key: "amount",
                  header: t("form.lineTotal"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatMoney(row.amount),
                },
              ]}
            />
            <dl className="ml-auto mt-4 max-w-[360px] space-y-1.5 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[#64748B]">{t("form.subtotal")}</dt>
                <dd className="tabular-nums">
                  {formatMoney(invoice.subtotal)}
                </dd>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t("form.discount")}</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(invoice.discount_amount)}
                  </dd>
                </div>
              )}
              {invoice.vat_rate !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">
                    {t("form.vat", { rate: formatPercent(invoice.vat_rate) })}
                  </dt>
                  <dd className="tabular-nums">
                    {formatMoney(invoice.vat_amount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-[#E2E8F0] pt-2 text-[16px] font-black">
                <dt>{t("form.total")}</dt>
                <dd className="tabular-nums">{formatMoney(invoice.total)}</dd>
              </div>
              {live && (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#64748B]">{tf("columns.paid")}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(invoice.net_paid)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 font-bold">
                    <dt>{tf("columns.remaining")}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(invoice.remaining)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-4 space-y-1 text-[13px] text-[#475569]">
              {invoice.payment_method && (
                <p>
                  {t("form.paymentMethod")}:{" "}
                  {tf(`methods.${invoice.payment_method}`)}
                </p>
              )}
              {invoice.related_reference && (
                <p>
                  {t("form.relatedReference")}: {invoice.related_reference}
                </p>
              )}
              {invoice.notes && (
                <p className="whitespace-pre-line">
                  {t("form.notes")}: {invoice.notes}
                </p>
              )}
              {invoice.terms && (
                <p className="whitespace-pre-line">
                  {t("form.terms")}: {invoice.terms}
                </p>
              )}
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section title={t("detail.sections.payments")}>
            {payments.length === 0 ? (
              <p className="text-[13px] text-[#94A3B8]">
                {t("detail.sections.paymentsEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {payments.map((row) => (
                  <li
                    key={`${row.source}:${row.id}`}
                    className="rounded-xl border border-[#F1F5F9] p-3 text-[13px]"
                  >
                    <p className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#0F172A]">
                      <span>{paymentCode(row)}</span>
                      <span className="tabular-nums">
                        {formatMoney(row.net_amount)}
                      </span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[#64748B]">
                      {tbilisiDateTime(row.occurred_at)}
                      <Pill tone={statusTone(row.status)}>
                        {tf(`paymentStatuses.${row.status}`)}
                      </Pill>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("detail.sections.documents")}>
            {documents.length === 0 ? (
              <p className="text-[13px] text-[#94A3B8]">
                {t("detail.sections.documentsEmpty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="rounded-xl border border-[#F1F5F9] p-3 text-[13px]"
                  >
                    <a
                      href={`/api/admin/finance/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${linkClass} break-all`}
                    >
                      {recordCode("DOC", doc.document_no)} · {doc.title}
                    </a>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[#64748B]">
                      {tf(`documentTypes.${doc.doc_type}`)} ·{" "}
                      {tbilisiDateTime(doc.created_at)}
                      {doc.status === "voided" && (
                        <Pill>{tf("documentStatuses.voided")}</Pill>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("detail.sections.delivery")}>
            <div className="space-y-2 text-[13px] text-[#475569]">
              <p>
                {invoice.sent_count > 0
                  ? t("detail.sentInfo", {
                      count: invoice.sent_count,
                      to: invoice.last_sent_to ?? "—",
                      at: tbilisiDateTime(invoice.sent_at),
                    })
                  : t("detail.notSent")}
              </p>
              <p>
                {invoice.has_share_link && invoice.share_expires_at
                  ? t("detail.shareModal.hasLink", {
                      date: tbilisiDate(invoice.share_expires_at),
                    })
                  : t("detail.shareModal.none")}
              </p>
            </div>
          </Section>
        </div>
      </div>

      <Notice tone="neutral">{tf("disclaimers.invoice")}</Notice>

      <Modal
        isOpen={dialog === "issue"}
        onClose={() => setDialog(null)}
        title={t("detail.issue")}
        size="sm"
      >
        <div className="space-y-4">
          <Notice tone="warning">{t("detail.confirmIssue")}</Notice>
          <Button
            variant="primary"
            className="w-full"
            loading={busy === "issue"}
            onClick={async () => {
              const result = await action("issue");
              if (!result) return;
              setDialog(null);
              toast.success(
                t("detail.issuedToast", {
                  number: String(result.invoice_number ?? ""),
                }),
              );
              if (!result.archived) toast.warning(t("detail.archiveFailed"));
              reload();
            }}
          >
            {t("detail.issue")}
          </Button>
        </div>
      </Modal>
      <SendDialog
        invoice={invoice}
        open={dialog === "send"}
        onClose={() => setDialog(null)}
        onDone={reload}
      />
      <ShareDialog
        invoice={invoice}
        open={dialog === "share"}
        onClose={() => setDialog(null)}
        onDone={reload}
      />
      <MarkSentDialog
        invoice={invoice}
        open={dialog === "markSent"}
        onClose={() => setDialog(null)}
        onDone={reload}
      />
      <LinkPaymentDialog
        invoice={invoice}
        open={dialog === "link"}
        onClose={() => setDialog(null)}
        onDone={reload}
      />
      <IncomeModal
        open={dialog === "payment"}
        onClose={() => setDialog(null)}
        onSaved={reload}
        preset={{
          amount: invoice.remaining.toFixed(2),
          payer: invoice.recipient_profile_id
            ? {
                kind: "client",
                id: invoice.recipient_profile_id,
                label: invoice.recipient_name,
              }
            : null,
          payerName: invoice.recipient_name,
          payerTaxId: invoice.recipient_tax_id ?? "",
          method: invoice.payment_method ?? "bank_transfer",
          reference: invoice.invoice_number ?? "",
          invoiceId: invoice.id,
          invoiceLabel: `${t("detail.paymentModal.hint")} ${t(
            "detail.paymentModal.remaining",
            { amount: formatMoney(invoice.remaining) },
          )}`,
        }}
      />
      <ReasonModal
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title={t("detail.cancelModal.title")}
        body={t("detail.cancelModal.body")}
        label={tf("common.reason")}
        confirmLabel={t("detail.cancelInvoice")}
        onConfirm={async (reason) => {
          const result = await financeRequest(
            `/api/admin/finance/invoices/${invoice.id}`,
            { method: "POST", json: { action: "cancel", reason } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("detail.cancelModal.done"));
          reload();
          return null;
        }}
      />
      <DocumentUploadModal
        open={dialog === "document"}
        onClose={() => setDialog(null)}
        onUploaded={reload}
        defaultType="invoice"
        link={{
          kind: "invoice",
          id: invoice.id,
          label: invoice.invoice_number ?? t("detail.draftTitle"),
        }}
        defaults={{
          title: invoice.invoice_number ?? "",
          counterparty: invoice.recipient_name,
          amount: invoice.total.toFixed(2),
        }}
      />
    </>
  );
}
