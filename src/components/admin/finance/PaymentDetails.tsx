"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";
import {
  PAYMENT_METHODS,
  paymentCode,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiDateTime, tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney } from "@/lib/finance/money";
import { financeRequest, useErrorText } from "./api";
import AuditHistory from "./AuditHistory";
import type { Column } from "./DataTable";
import DocumentUploadModal from "./DocumentUploadModal";
import { ReasonModal } from "./EntryModals";
import {
  Button,
  Field,
  Notice,
  Pill,
  Select,
  buttonClass,
  inputClass,
  linkClass,
  noticeLinkClass,
  statusTone,
  textareaClass,
} from "./ui";

// One row of the revenue journal / payments register (finance_payments_v)
// with what can be done to it (spec §2, §4, §5, §14). Keepz payments are
// managed on the Keepz payments page; manual entries are refunded, reversed
// or settled here.

export type PaymentRow = {
  source: "keepz" | "manual";
  id: string;
  entry_no: number | null;
  reference: string | null;
  occurred_at: string;
  created_at: string;
  payer_id: string | null;
  payer_name: string | null;
  payer_tax_id: string | null;
  payment_method: string | null;
  provider_name: string | null;
  revenue_type: string | null;
  property_id: string | null;
  service_id: string | null;
  amount: number;
  refunded_amount: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_amount: number;
  owner_refunded: number;
  status: string;
  source_status: string | null;
  reversed: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  review_flag: string | null;
  note: string | null;
  net_amount: number;
  owner_net: number;
  own_amount: number;
  object_title: string | null;
};

type Dialog =
  "refund" | "reverse" | "complete" | "fail" | "cancel" | "document";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-[#64748B]">{label}</dt>
      <dd className="mt-0.5 break-words text-[14px] text-[#0F172A]">
        {children ?? "—"}
      </dd>
    </div>
  );
}

function RefundDialog({
  row,
  open,
  onClose,
  onDone,
}: {
  row: PaymentRow;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [amount, setAmount] = useState("");
  const [ownerAmount, setOwnerAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const code = paymentCode(row);

  useEffect(() => {
    if (!open) return;
    setAmount(row.net_amount.toFixed(2));
    setOwnerAmount(row.owner_net > 0 ? row.owner_net.toFixed(2) : "");
    setMethod(row.payment_method ?? "bank_transfer");
    setDate("");
    setTime("");
    setNote("");
    setProblem(null);
  }, [open, row.net_amount, row.owner_net, row.payment_method]);

  const value = parseMoney(amount);
  const owner = ownerAmount.trim() ? parseMoney(ownerAmount) : 0;
  const valid =
    value !== null &&
    value > 0 &&
    value <= row.net_amount &&
    owner !== null &&
    owner <= value &&
    owner <= row.owner_net &&
    note.trim();

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{ entry_no: number }>(
      "/api/admin/finance/entries",
      {
        method: "POST",
        json: {
          kind: "refund",
          original_entry_id: row.id,
          amount,
          owner_amount: ownerAmount,
          payment_method: method,
          occurred_on: date,
          occurred_time: time,
          note,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(
      t("revenue.refundModal.created", {
        code: recordCode("FE", result.data.entry_no),
      }),
    );
    onDone();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("revenue.refundModal.title", { code })}
      size="md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        <Notice tone="info">
          {t("revenue.refundModal.available", {
            amount: formatMoney(row.net_amount),
          })}
        </Notice>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("revenue.refundModal.amount")} htmlFor="rf-amount">
            <input
              id="rf-amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          {row.owner_net > 0 && (
            <Field
              label={t("revenue.refundModal.ownerAmount")}
              htmlFor="rf-owner"
            >
              <input
                id="rf-owner"
                inputMode="decimal"
                value={ownerAmount}
                onChange={(event) => setOwnerAmount(event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <Field label={t("revenue.incomeModal.method")} htmlFor="rf-method">
            <Select
              id="rf-method"
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: t(`methods.${m}`),
              }))}
            />
          </Field>
          <Field label={t("common.date")}>
            <DateField
              value={date}
              max={tbilisiToday()}
              clearable
              onChange={setDate}
            />
          </Field>
          <Field label={t("common.time")} hint={t("common.timeHint")}>
            <TimeField value={time} onChange={setTime} />
          </Field>
        </div>
        <Field label={t("revenue.refundModal.reason")} htmlFor="rf-note">
          <textarea
            id="rf-note"
            required
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={textareaClass}
          />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!valid}
        >
          {t("revenue.refund")}
        </Button>
      </form>
    </Modal>
  );
}

function CompleteDialog({
  row,
  open,
  onClose,
  onDone,
}: {
  row: PaymentRow;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate("");
      setTime("");
      setProblem(null);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    const result = await financeRequest(
      `/api/admin/finance/entries/${row.id}`,
      {
        method: "POST",
        json: { action: "complete", occurred_on: date, occurred_time: time },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(t("revenue.completeModal.done"));
    onDone();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("revenue.completeModal.title", { code: paymentCode(row) })}
      size="sm"
    >
      <div className="space-y-4">
        <Notice tone="info">{t("revenue.completeModal.body")}</Notice>
        <Field label={t("common.date")}>
          <DateField
            value={date}
            max={tbilisiToday()}
            clearable
            onChange={setDate}
          />
        </Field>
        <Field label={t("common.time")} hint={t("common.timeHint")}>
          <TimeField value={time} onChange={setTime} />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          onClick={submit}
        >
          {t("revenue.complete")}
        </Button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) setProblem(null);
  }, [open]);
  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <Notice tone="warning">{body}</Notice>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          variant="primary"
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const failure = await onConfirm();
            setBusy(false);
            if (failure) setProblem(failure);
            else onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function PaymentDetailsModal({
  row,
  onClose,
  onChanged,
}: {
  row: PaymentRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [current, setCurrent] = useState<PaymentRow | null>(row);

  useEffect(() => {
    if (row) setCurrent(row);
  }, [row]);

  if (!current) return null;
  const code = paymentCode(current);
  const manual = current.source === "manual";
  const live = manual && !current.reversed && current.status !== "cancelled";
  const refundable =
    live &&
    (current.status === "completed" ||
      current.status === "partially_refunded") &&
    current.net_amount > 0;
  const pending = live && current.status === "pending";

  const done = () => {
    onChanged();
    onClose();
  };

  async function settle(action: "fail" | "cancel") {
    const result = await financeRequest(
      `/api/admin/finance/entries/${current!.id}`,
      { method: "POST", json: { action } },
    );
    if (!result.ok) return errorText(result.error.code);
    toast.success(
      t(action === "fail" ? "revenue.failDone" : "revenue.cancelDone"),
    );
    done();
    return null;
  }

  return (
    <>
      <Modal
        isOpen={Boolean(row) && dialog === null}
        onClose={onClose}
        title={code || t("common.details")}
        size="lg"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={statusTone(current.status)}>
              {t(`paymentStatuses.${current.status}`)}
            </Pill>
            <Pill>{t(`sources.${current.source}`)}</Pill>
            {current.reversed && (
              <Pill tone="warning">{t("entryStates.reversed")}</Pill>
            )}
            {current.review_flag && (
              <Pill tone="warning">
                {t(`reviewFlags.${current.review_flag}`)}
              </Pill>
            )}
          </div>

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label={t("columns.dateTime")}>
              {tbilisiDateTime(current.occurred_at)}
            </Fact>
            <Fact label={t("columns.client")}>
              {current.payer_name}
              {current.payer_tax_id && (
                <span className="block text-[12px] text-[#64748B]">
                  {current.payer_tax_id}
                </span>
              )}
            </Fact>
            <Fact label={t("columns.object")}>{current.object_title}</Fact>
            <Fact label={t("columns.revenueType")}>
              {current.revenue_type
                ? t(`revenueTypes.${current.revenue_type}`)
                : null}
            </Fact>
            <Fact label={t("columns.method")}>
              {current.payment_method
                ? t(`methods.${current.payment_method}`)
                : null}
              {current.provider_name && ` · ${current.provider_name}`}
            </Fact>
            <Fact label={t("columns.reference")}>{current.reference}</Fact>
            <Fact label={t("columns.gross")}>
              {formatMoney(current.amount)}
            </Fact>
            <Fact label={t("columns.refunded")}>
              {formatMoney(current.refunded_amount)}
            </Fact>
            <Fact label={t("columns.net")}>
              {formatMoney(current.net_amount)}
            </Fact>
            <Fact label={t("columns.own")}>
              {formatMoney(current.own_amount)}
            </Fact>
            <Fact label={t("columns.ownerShare")}>
              {formatMoney(current.owner_net)}
              {current.owner_name && (
                <span className="block text-[12px] text-[#64748B]">
                  {current.owner_name}
                </span>
              )}
            </Fact>
            <Fact label={t("columns.invoice")}>
              {current.invoice_id ? (
                <Link
                  href={`/dashboard/admin/finances/invoices/${current.invoice_id}`}
                  className={linkClass}
                >
                  {current.invoice_number}
                </Link>
              ) : null}
            </Fact>
            {current.source_status && (
              <Fact label={t("columns.sourceStatus")}>
                {t(`sourceStatuses.${current.source_status}`)}
              </Fact>
            )}
            {current.note && (
              <Fact label={t("columns.note")}>{current.note}</Fact>
            )}
          </dl>

          {!manual && (
            <Notice tone="neutral">
              {t("revenue.keepzHint")}{" "}
              <Link
                href="/dashboard/admin/payments"
                className={noticeLinkClass}
              >
                {t("revenue.openKeepz")}
              </Link>
            </Notice>
          )}

          <div className="flex flex-wrap gap-2 border-t border-[#F1F5F9] pt-4">
            {pending && (
              <>
                <Button variant="primary" onClick={() => setDialog("complete")}>
                  {t("revenue.complete")}
                </Button>
                <Button onClick={() => setDialog("fail")}>
                  {t("revenue.fail")}
                </Button>
                <Button onClick={() => setDialog("cancel")}>
                  {t("revenue.cancelEntry")}
                </Button>
              </>
            )}
            {refundable && (
              <Button variant="primary" onClick={() => setDialog("refund")}>
                {t("revenue.refund")}
              </Button>
            )}
            {live && (
              <Button variant="danger" onClick={() => setDialog("reverse")}>
                {t("revenue.reverse")}
              </Button>
            )}
            {manual && (
              <Button onClick={() => setDialog("document")}>
                {t("revenue.attach")}
              </Button>
            )}
            {manual && <AuditHistory table="finance_entries" id={current.id} />}
            {!manual && (
              <Link
                href="/dashboard/admin/payments"
                className={buttonClass("secondary")}
              >
                {t("payments.keepzLink")}
              </Link>
            )}
          </div>
        </div>
      </Modal>

      <RefundDialog
        row={current}
        open={dialog === "refund"}
        onClose={() => setDialog(null)}
        onDone={done}
      />
      <CompleteDialog
        row={current}
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        onDone={done}
      />
      <ConfirmDialog
        open={dialog === "fail" || dialog === "cancel"}
        onClose={() => setDialog(null)}
        title={code}
        body={t(
          dialog === "fail" ? "revenue.confirmFail" : "revenue.confirmCancel",
        )}
        confirmLabel={t(
          dialog === "fail" ? "revenue.fail" : "revenue.cancelEntry",
        )}
        onConfirm={() => settle(dialog === "fail" ? "fail" : "cancel")}
      />
      <ReasonModal
        open={dialog === "reverse"}
        onClose={() => setDialog(null)}
        title={t("revenue.reverseModal.title", { code })}
        body={t("revenue.reverseModal.body")}
        label={t("revenue.reverseModal.reason")}
        confirmLabel={t("revenue.reverse")}
        onConfirm={async (note) => {
          const result = await financeRequest(
            `/api/admin/finance/entries/${current.id}`,
            { method: "POST", json: { action: "reverse", note } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("revenue.reverseModal.done"));
          done();
          return null;
        }}
      />
      <DocumentUploadModal
        open={dialog === "document"}
        onClose={() => setDialog(null)}
        onUploaded={onChanged}
        defaultType="bank_confirmation"
        link={{ kind: "entry", id: current.id, label: code }}
        defaults={{
          title: code,
          counterparty: current.payer_name ?? undefined,
          amount: current.amount.toFixed(2),
        }}
      />
    </>
  );
}

export type PaymentTotals = {
  amount: number;
  refunded: number;
  net: number;
  own: number;
  owner: number;
};

/** Columns of the revenue journal (spec §2) and, with registry, §4. */
export function usePaymentColumns(
  onOpen: (row: PaymentRow) => void,
  totals: PaymentTotals | null,
  { registry = false }: { registry?: boolean } = {},
): Column<PaymentRow>[] {
  const t = useTranslations("AdminFinances");
  const money = (value: number | undefined) =>
    value === undefined ? undefined : formatMoney(value);
  const columns: (Column<PaymentRow> | false)[] = [
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
      render: (row) => (
        <button type="button" onClick={() => onOpen(row)} className={linkClass}>
          {paymentCode(row) || t("common.details")}
        </button>
      ),
    },
    {
      key: "client",
      header: t("columns.client"),
      className: "min-w-[140px]",
      render: (row) => row.payer_name ?? "—",
    },
    {
      key: "object",
      header: t("columns.object"),
      className: "min-w-[140px]",
      render: (row) => row.object_title ?? "—",
    },
    {
      key: "type",
      header: t("columns.revenueType"),
      className: "min-w-[130px]",
      render: (row) =>
        row.revenue_type ? t(`revenueTypes.${row.revenue_type}`) : "—",
    },
    {
      key: "gross",
      header: t(registry ? "columns.amount" : "columns.gross"),
      align: "right",
      className: "whitespace-nowrap",
      render: (row) => formatMoney(row.amount),
      total: money(totals?.amount),
    },
    {
      key: "refunded",
      header: t("columns.refunded"),
      align: "right",
      className: "whitespace-nowrap",
      render: (row) => formatMoney(row.refunded_amount),
      total: money(totals?.refunded),
    },
    !registry && {
      key: "net",
      header: t("columns.net"),
      align: "right",
      className: "whitespace-nowrap",
      render: (row) => formatMoney(row.net_amount),
      total: money(totals?.net),
    },
    !registry && {
      key: "own",
      header: t("columns.own"),
      align: "right",
      className: "whitespace-nowrap",
      render: (row) => formatMoney(row.own_amount),
      total: money(totals?.own),
    },
    !registry && {
      key: "owner",
      header: t("columns.ownerShare"),
      align: "right",
      className: "whitespace-nowrap",
      render: (row) => formatMoney(row.owner_net),
      total: money(totals?.owner),
    },
    {
      key: "method",
      header: t("columns.method"),
      className: "whitespace-nowrap",
      render: (row) =>
        row.payment_method ? t(`methods.${row.payment_method}`) : "—",
    },
    registry && {
      key: "provider",
      header: t("columns.provider"),
      className: "whitespace-nowrap",
      render: (row) => row.provider_name ?? "—",
    },
    {
      key: "status",
      header: t("columns.status"),
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          <Pill tone={statusTone(row.status)}>
            {t(`paymentStatuses.${row.status}`)}
          </Pill>
          {row.reversed && (
            <Pill tone="warning">{t("entryStates.reversed")}</Pill>
          )}
        </span>
      ),
    },
    registry && {
      key: "sourceStatus",
      header: t("columns.sourceStatus"),
      className: "whitespace-nowrap",
      render: (row) =>
        row.source_status ? t(`sourceStatuses.${row.source_status}`) : "—",
    },
    registry && {
      key: "flag",
      header: t("columns.reviewFlag"),
      render: (row) =>
        row.review_flag ? (
          <Pill tone="warning">{t(`reviewFlags.${row.review_flag}`)}</Pill>
        ) : (
          "—"
        ),
    },
    {
      key: "invoice",
      header: t("columns.invoice"),
      className: "whitespace-nowrap",
      render: (row) =>
        row.invoice_id ? (
          <Link
            href={`/dashboard/admin/finances/invoices/${row.invoice_id}`}
            className={linkClass}
          >
            {row.invoice_number}
          </Link>
        ) : (
          "—"
        ),
    },
  ];
  return columns.filter((c): c is Column<PaymentRow> => Boolean(c));
}
