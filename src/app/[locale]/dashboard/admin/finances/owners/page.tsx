"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";
import { PAYMENT_METHODS, recordCode } from "@/lib/finance/constants";
import { tbilisiDateTime, tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney } from "@/lib/finance/money";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import AuditHistory from "@/components/admin/finance/AuditHistory";
import DataTable from "@/components/admin/finance/DataTable";
import EntityPicker, {
  type Entity,
} from "@/components/admin/finance/EntityPicker";
import { ReasonModal } from "@/components/admin/finance/EntryModals";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Pill,
  Select,
  Skeletons,
  inputClass,
  textareaClass,
} from "@/components/admin/finance/ui";

// Money that belongs to owners (spec §6, C42): collected on their behalf,
// refunded, paid on, and still owed — e.g. 500 ₾ received, 450 ₾ owed to the
// owner, 50 ₾ MyBakuriani's. Payouts are recorded here and only reversed.

type Payable = {
  owner_id: string | null;
  owner_name: string | null;
  collected: number;
  refunded: number;
  paid_out: number;
  outstanding: number;
  last_activity: string | null;
};

type Payout = {
  id: string;
  entry_no: number;
  occurred_at: string;
  amount: number;
  owner_id: string | null;
  owner_name: string | null;
  payment_method: string | null;
  reference: string | null;
  note: string | null;
  reversed: boolean;
};

function PayoutModal({
  open,
  preset,
  onClose,
  onSaved,
}: {
  open: boolean;
  preset: Payable | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [owner, setOwner] = useState<Entity | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setOwner(
      preset?.owner_id
        ? {
            kind: "client",
            id: preset.owner_id,
            label: preset.owner_name ?? preset.owner_id,
          }
        : null,
    );
    setAmount(
      preset && preset.outstanding > 0 ? preset.outstanding.toFixed(2) : "",
    );
    setMethod("bank_transfer");
    setDate("");
    setTime("");
    setReference("");
    setNote("");
    setProblem(null);
  }, [open, preset]);

  const value = parseMoney(amount);
  const valid = owner && value !== null && value > 0;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{ entry_no: number }>(
      "/api/admin/finance/entries",
      {
        method: "POST",
        json: {
          kind: "owner_payout",
          owner_id: owner?.id,
          amount,
          payment_method: method,
          occurred_on: date,
          occurred_time: time,
          reference,
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
      t("owners.payoutModal.done", {
        code: recordCode("FE", result.data.entry_no),
      }),
    );
    onSaved();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("owners.payoutModal.title")}
      size="md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        {preset && (
          <Notice tone="info">
            {t("owners.payoutModal.outstanding", {
              amount: formatMoney(preset.outstanding),
            })}
          </Notice>
        )}
        <Field label={t("revenue.incomeModal.owner")} htmlFor="po-owner">
          <EntityPicker
            id="po-owner"
            kinds={["client"]}
            value={owner}
            onChange={setOwner}
            placeholder={t("filters.userPlaceholder")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("owners.payoutModal.amount")} htmlFor="po-amount">
            <input
              id="po-amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("revenue.incomeModal.method")} htmlFor="po-method">
            <Select
              id="po-method"
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
        <Field label={t("revenue.incomeModal.reference")} htmlFor="po-ref">
          <input
            id="po-ref"
            maxLength={200}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t("revenue.incomeModal.note")} htmlFor="po-note">
          <textarea
            id="po-note"
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
          {t("owners.payout")}
        </Button>
      </form>
    </Modal>
  );
}

export default function OwnersPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const payables = useFinanceQuery<{ rows: Payable[] }>(
    "/api/admin/finance/owners",
  );
  const payouts = useFinanceQuery<{ rows: Payout[] }>(
    "/api/admin/finance/entries?kind=owner_payout",
  );
  const [payoutFor, setPayoutFor] = useState<Payable | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [reversing, setReversing] = useState<Payout | null>(null);

  const refresh = () => {
    payables.reload();
    payouts.reload();
  };
  const rows = payables.data?.rows ?? [];
  const sum = (pick: (row: Payable) => number) =>
    formatMoney(rows.reduce((total, row) => total + pick(row), 0));

  return (
    <>
      <PageHeader
        title={t("owners.title")}
        subtitle={t("owners.subtitle")}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setPayoutFor(null);
              setPayoutOpen(true);
            }}
          >
            {t("owners.payout")}
          </Button>
        }
      />
      <Notice tone="neutral">{t("disclaimers.owners")}</Notice>

      <div className="flex justify-end">
        <ExportButtons report="owners" />
      </div>

      {payables.loading && !payables.data ? (
        <Skeletons count={3} className="h-12" />
      ) : payables.error ? (
        <ErrorState
          message={errorText(payables.error.code)}
          onRetry={payables.reload}
        />
      ) : !rows.length ? (
        <EmptyState>{t("owners.empty")}</EmptyState>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(row) => row.owner_id ?? "none"}
          minWidth={860}
          totalsLabel={t("common.totals")}
          columns={[
            {
              key: "owner",
              header: t("columns.owner"),
              className: "min-w-[160px]",
              render: (row) => row.owner_name ?? "—",
            },
            {
              key: "collected",
              header: t("columns.collected"),
              align: "right",
              className: "whitespace-nowrap",
              render: (row) => formatMoney(row.collected),
              total: sum((r) => r.collected),
            },
            {
              key: "refunded",
              header: t("columns.refunded"),
              align: "right",
              className: "whitespace-nowrap",
              render: (row) => formatMoney(row.refunded),
              total: sum((r) => r.refunded),
            },
            {
              key: "paid",
              header: t("columns.paidOut"),
              align: "right",
              className: "whitespace-nowrap",
              render: (row) => formatMoney(row.paid_out),
              total: sum((r) => r.paid_out),
            },
            {
              key: "outstanding",
              header: t("columns.outstanding"),
              align: "right",
              className: "whitespace-nowrap font-bold",
              render: (row) => formatMoney(row.outstanding),
              total: sum((r) => Math.max(r.outstanding, 0)),
            },
            {
              key: "last",
              header: t("columns.lastActivity"),
              className: "whitespace-nowrap",
              render: (row) => tbilisiDateTime(row.last_activity) || "—",
            },
            {
              key: "actions",
              header: t("columns.actions"),
              render: (row) =>
                row.outstanding > 0 && row.owner_id ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPayoutFor(row);
                      setPayoutOpen(true);
                    }}
                  >
                    {t("owners.payout")}
                  </Button>
                ) : null,
            },
          ]}
        />
      )}

      <Card
        title={t("owners.payoutsTitle")}
        actions={<ExportButtons report="payouts" />}
      >
        {payouts.loading && !payouts.data ? (
          <Skeletons count={2} className="h-12" />
        ) : payouts.error ? (
          <ErrorState
            message={errorText(payouts.error.code)}
            onRetry={payouts.reload}
          />
        ) : !payouts.data?.rows.length ? (
          <EmptyState>{t("owners.payoutsEmpty")}</EmptyState>
        ) : (
          <DataTable
            rows={payouts.data.rows}
            rowKey={(row) => row.id}
            minWidth={900}
            rowClassName={(row) => (row.reversed ? "opacity-60" : undefined)}
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
                render: (row) => recordCode("FE", row.entry_no),
              },
              {
                key: "owner",
                header: t("columns.owner"),
                className: "min-w-[140px]",
                render: (row) => row.owner_name ?? "—",
              },
              {
                key: "amount",
                header: t("columns.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.amount),
              },
              {
                key: "method",
                header: t("columns.method"),
                className: "whitespace-nowrap",
                render: (row) =>
                  row.payment_method ? t(`methods.${row.payment_method}`) : "—",
              },
              {
                key: "reference",
                header: t("columns.reference"),
                render: (row) => row.reference ?? "—",
              },
              {
                key: "state",
                header: t("columns.status"),
                render: (row) =>
                  row.reversed ? (
                    <Pill tone="warning">{t("entryStates.reversed")}</Pill>
                  ) : (
                    <Pill tone="success">{t("entryStates.active")}</Pill>
                  ),
              },
              {
                key: "actions",
                header: t("columns.actions"),
                render: (row) => (
                  <span className="flex flex-wrap gap-1">
                    {!row.reversed && (
                      <Button variant="ghost" onClick={() => setReversing(row)}>
                        {t("revenue.reverse")}
                      </Button>
                    )}
                    <AuditHistory table="finance_entries" id={row.id} />
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>

      <PayoutModal
        open={payoutOpen}
        preset={payoutFor}
        onClose={() => setPayoutOpen(false)}
        onSaved={refresh}
      />
      <ReasonModal
        open={Boolean(reversing)}
        onClose={() => setReversing(null)}
        title={t("revenue.reverseModal.title", {
          code: recordCode("FE", reversing?.entry_no),
        })}
        body={t("revenue.reverseModal.body")}
        label={t("revenue.reverseModal.reason")}
        confirmLabel={t("revenue.reverse")}
        onConfirm={async (note) => {
          const result = await financeRequest(
            `/api/admin/finance/entries/${reversing!.id}`,
            { method: "POST", json: { action: "reverse", note } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("revenue.reverseModal.done"));
          refresh();
          return null;
        }}
      />
    </>
  );
}
