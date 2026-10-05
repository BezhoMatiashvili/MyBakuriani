"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";
import {
  PAYMENT_METHODS,
  PAYMENT_SOURCES,
  RECEIVED_PAYMENT_STATUSES,
  REVENUE_TYPES,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiDateTime, tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney } from "@/lib/finance/money";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import AuditHistory from "@/components/admin/finance/AuditHistory";
import DataTable from "@/components/admin/finance/DataTable";
import {
  IncomeModal,
  ReasonModal,
} from "@/components/admin/finance/EntryModals";
import ExportButtons from "@/components/admin/finance/ExportButtons";
import {
  PaymentDetailsModal,
  usePaymentColumns,
  type PaymentRow,
  type PaymentTotals,
} from "@/components/admin/finance/PaymentDetails";
import RegisterFilters, {
  useRegisterQuery,
} from "@/components/admin/finance/RegisterFilters";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Pager,
  Pill,
  Select,
  Skeletons,
  inputClass,
  textareaClass,
} from "@/components/admin/finance/ui";

// Revenue journal (spec §2, C42): money received — Keepz card payments and
// income recorded by hand — with refunds, reversals and the MyBakuriani /
// owner split; own-revenue adjustments below it.

type ListPage = {
  rows: PaymentRow[];
  count: number;
  page: number;
  pageSize: number;
  totals: PaymentTotals;
};

type Adjustment = {
  id: string;
  entry_no: number;
  occurred_at: string;
  amount: number;
  revenue_type: string | null;
  note: string | null;
  reversed: boolean;
};

function AdjustmentModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [amount, setAmount] = useState("");
  const [revenueType, setRevenueType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setRevenueType("");
    setDate("");
    setTime("");
    setNote("");
    setProblem(null);
  }, [open]);

  const value = parseMoney(amount, { allowNegative: true });
  const valid = value !== null && value !== 0 && revenueType && note.trim();

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{ entry_no: number }>(
      "/api/admin/finance/entries",
      {
        method: "POST",
        json: {
          kind: "adjustment",
          amount,
          revenue_type: revenueType,
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
    toast.success(t("revenue.adjustmentModal.done"));
    onSaved();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("revenue.adjustmentModal.title")}
      size="md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        <Notice tone="info">{t("revenue.adjustmentsHint")}</Notice>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("revenue.adjustmentModal.amount")}
            htmlFor="adj-amount"
          >
            <input
              id="adj-amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("revenue.incomeModal.revenueType")}
            htmlFor="adj-type"
          >
            <Select
              id="adj-type"
              value={revenueType}
              onChange={setRevenueType}
              placeholder={t("common.select")}
              options={REVENUE_TYPES.map((type) => ({
                value: type,
                label: t(`revenueTypes.${type}`),
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
        <Field label={t("revenue.adjustmentModal.reason")} htmlFor="adj-note">
          <textarea
            id="adj-note"
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
          {t("common.save")}
        </Button>
      </form>
    </Modal>
  );
}

function AdjustmentsCard({
  filterQuery,
  version,
  onAdd,
}: {
  filterQuery: string;
  version: number;
  onAdd: () => void;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const params = new URLSearchParams(filterQuery);
  const dateQuery = new URLSearchParams();
  for (const key of ["from", "to", "type"]) {
    const value = params.get(key);
    if (value) dateQuery.set(key, value);
  }
  const { data, error, loading, reload } = useFinanceQuery<{
    rows: Adjustment[];
  }>(
    `/api/admin/finance/entries?kind=adjustment&${dateQuery.toString()}&v=${version}`,
  );
  const [reversing, setReversing] = useState<Adjustment | null>(null);

  return (
    <Card
      title={t("revenue.adjustmentsTitle")}
      description={t("revenue.adjustmentsHint")}
      actions={
        <>
          <ExportButtons report="adjustments" query={dateQuery.toString()} />
          <Button icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            {t("revenue.addAdjustment")}
          </Button>
        </>
      }
    >
      {loading && !data ? (
        <Skeletons count={2} className="h-12" />
      ) : error ? (
        <ErrorState message={errorText(error.code)} onRetry={reload} />
      ) : !data?.rows.length ? (
        <EmptyState>{t("revenue.adjustmentsEmpty")}</EmptyState>
      ) : (
        <DataTable
          rows={data.rows}
          rowKey={(row) => row.id}
          minWidth={720}
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
              key: "type",
              header: t("columns.revenueType"),
              render: (row) =>
                row.revenue_type ? t(`revenueTypes.${row.revenue_type}`) : "—",
            },
            {
              key: "amount",
              header: t("columns.amount"),
              align: "right",
              className: "whitespace-nowrap",
              render: (row) => formatMoney(row.amount),
            },
            {
              key: "note",
              header: t("columns.note"),
              className: "min-w-[200px]",
              render: (row) => row.note ?? "—",
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
          reload();
          return null;
        }}
      />
    </Card>
  );
}

export default function RevenuePage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const [version, setVersion] = useState(0);
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/payments?view=journal&${query}&v=${version}`,
  );
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const columns = usePaymentColumns(setSelected, data?.totals ?? null);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <>
      <PageHeader
        title={t("revenue.title")}
        subtitle={t("revenue.subtitle")}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setIncomeOpen(true)}
          >
            {t("revenue.addIncome")}
          </Button>
        }
      />
      <Notice tone="neutral">{t("disclaimers.journal")}</Notice>

      <RegisterFilters
        selects={[
          {
            param: "type",
            label: t("filters.type"),
            options: REVENUE_TYPES.map((v) => ({
              value: v,
              label: t(`revenueTypes.${v}`),
            })),
          },
          {
            param: "method",
            label: t("filters.method"),
            options: PAYMENT_METHODS.map((v) => ({
              value: v,
              label: t(`methods.${v}`),
            })),
          },
          {
            param: "status",
            label: t("filters.status"),
            options: RECEIVED_PAYMENT_STATUSES.map((v) => ({
              value: v,
              label: t(`paymentStatuses.${v}`),
            })),
          },
          {
            param: "source",
            label: t("filters.source"),
            options: PAYMENT_SOURCES.map((v) => ({
              value: v,
              label: t(`sources.${v}`),
            })),
          },
        ]}
        pickers={[
          { param: "payer", label: t("filters.client"), kinds: ["client"] },
          { param: "owner", label: t("filters.owner"), kinds: ["client"] },
          {
            param: "object",
            label: t("filters.object"),
            kinds: ["property", "service"],
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? t("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="journal" query={filterQuery} />
      </div>

      {loading && !data ? (
        <Skeletons count={5} className="h-12" />
      ) : error ? (
        <ErrorState message={errorText(error.code)} onRetry={reload} />
      ) : !data?.rows.length ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <>
          <DataTable
            rows={data.rows}
            rowKey={(row) => `${row.source}:${row.id}`}
            columns={columns}
            minWidth={1280}
            totalsLabel={t("common.totals")}
            rowClassName={(row) => (row.reversed ? "opacity-60" : undefined)}
          />
          <Pager
            page={page}
            pageSize={data.pageSize}
            count={data.count}
            onPage={setPage}
          />
        </>
      )}

      <AdjustmentsCard
        filterQuery={filterQuery}
        version={version}
        onAdd={() => setAdjustmentOpen(true)}
      />

      <PaymentDetailsModal
        row={selected}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
      <IncomeModal
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        onSaved={refresh}
      />
      <AdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        onSaved={refresh}
      />
    </>
  );
}
