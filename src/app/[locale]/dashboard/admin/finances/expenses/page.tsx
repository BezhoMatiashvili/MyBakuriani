"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney } from "@/lib/finance/money";
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

// Expenses register (spec §11, C42). Append-only: a wrong expense is
// reversed, which records the same expense with the opposite sign.

type Expense = {
  id: string;
  expense_no: number;
  kind: "expense" | "reversal";
  reverses_id: string | null;
  expense_date: string;
  supplier_name: string;
  supplier_tax_id: string | null;
  category: string;
  document_number: string | null;
  amount: number;
  vat_amount: number;
  payment_method: string;
  note: string | null;
  reversed: boolean;
  documents: number;
};

type ListPage = {
  rows: Expense[];
  count: number;
  page: number;
  pageSize: number;
  totals: { amount: number; vat: number };
};

function ExpenseModal({
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
  const [date, setDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [taxId, setTaxId] = useState("");
  const [category, setCategory] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [vat, setVat] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(tbilisiToday());
    setSupplier("");
    setTaxId("");
    setCategory("");
    setDocumentNumber("");
    setAmount("");
    setVat("");
    setMethod("bank_transfer");
    setNote("");
    setProblem(null);
  }, [open]);

  const total = parseMoney(amount);
  const vatValue = vat.trim() ? parseMoney(vat) : 0;
  const valid =
    date &&
    supplier.trim() &&
    category &&
    total !== null &&
    total > 0 &&
    vatValue !== null &&
    vatValue <= total;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{ expense_no: number }>(
      "/api/admin/finance/expenses",
      {
        method: "POST",
        json: {
          expense_date: date,
          supplier_name: supplier,
          supplier_tax_id: taxId,
          category,
          document_number: documentNumber,
          amount,
          vat_amount: vat,
          payment_method: method,
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
      t("expenses.modal.created", {
        code: recordCode("EX", result.data.expense_no),
      }),
    );
    onSaved();
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("expenses.modal.title")}
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.date")}>
            <DateField value={date} max={tbilisiToday()} onChange={setDate} />
          </Field>
          <Field label={t("filters.category")} htmlFor="ex-category">
            <Select
              id="ex-category"
              value={category}
              onChange={setCategory}
              placeholder={t("common.select")}
              options={EXPENSE_CATEGORIES.map((c) => ({
                value: c,
                label: t(`expenseCategories.${c}`),
              }))}
            />
          </Field>
          <Field label={t("expenses.modal.supplier")} htmlFor="ex-supplier">
            <input
              id="ex-supplier"
              required
              maxLength={200}
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("expenses.modal.taxId")} htmlFor="ex-tax">
            <input
              id="ex-tax"
              maxLength={50}
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("expenses.modal.amount")} htmlFor="ex-amount">
            <input
              id="ex-amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("expenses.modal.vat")} htmlFor="ex-vat">
            <input
              id="ex-vat"
              inputMode="decimal"
              placeholder="0"
              value={vat}
              onChange={(event) => setVat(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("columns.documentNumber")} htmlFor="ex-doc">
            <input
              id="ex-doc"
              maxLength={100}
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("revenue.incomeModal.method")} htmlFor="ex-method">
            <Select
              id="ex-method"
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: t(`methods.${m}`),
              }))}
            />
          </Field>
        </div>
        <Field label={t("revenue.incomeModal.note")} htmlFor="ex-note">
          <textarea
            id="ex-note"
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

export default function ExpensesPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const { data, error, loading, reload } = useFinanceQuery<ListPage>(
    `/api/admin/finance/expenses?${query}`,
  );
  const [adding, setAdding] = useState(false);
  const [reversing, setReversing] = useState<Expense | null>(null);
  const [attaching, setAttaching] = useState<Expense | null>(null);
  const totals = data?.totals;

  return (
    <>
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle")}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setAdding(true)}
          >
            {t("expenses.add")}
          </Button>
        }
      />

      <RegisterFilters
        selects={[
          {
            param: "category",
            label: t("filters.category"),
            options: EXPENSE_CATEGORIES.map((v) => ({
              value: v,
              label: t(`expenseCategories.${v}`),
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
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#64748B]">
          {data ? t("common.records", { count: data.count }) : " "}
        </p>
        <ExportButtons report="expenses" query={filterQuery} />
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
            totalsLabel={t("common.totals")}
            rowClassName={(row) =>
              row.reversed || row.kind === "reversal" ? "opacity-60" : undefined
            }
            columns={[
              {
                key: "date",
                header: t("columns.date"),
                className: "whitespace-nowrap",
                render: (row) => row.expense_date,
              },
              {
                key: "id",
                header: t("columns.id"),
                className: "whitespace-nowrap",
                render: (row) => recordCode("EX", row.expense_no),
              },
              {
                key: "supplier",
                header: t("columns.supplier"),
                className: "min-w-[160px]",
                render: (row) => (
                  <>
                    {row.supplier_name}
                    {row.supplier_tax_id && (
                      <span className="block text-[12px] text-[#64748B]">
                        {row.supplier_tax_id}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: "category",
                header: t("columns.category"),
                className: "min-w-[140px]",
                render: (row) => t(`expenseCategories.${row.category}`),
              },
              {
                key: "document",
                header: t("columns.documentNumber"),
                render: (row) => row.document_number ?? "—",
              },
              {
                key: "amount",
                header: t("columns.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) =>
                  formatMoney(
                    row.kind === "reversal" ? -row.amount : row.amount,
                  ),
                total: totals ? formatMoney(totals.amount) : undefined,
              },
              {
                key: "vat",
                header: t("columns.vat"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) =>
                  formatMoney(
                    row.kind === "reversal" ? -row.vat_amount : row.vat_amount,
                  ),
                total: totals ? formatMoney(totals.vat) : undefined,
              },
              {
                key: "method",
                header: t("columns.method"),
                className: "whitespace-nowrap",
                render: (row) => t(`methods.${row.payment_method}`),
              },
              {
                key: "docs",
                header: t("columns.primaryDocument"),
                className: "whitespace-nowrap",
                render: (row) =>
                  row.documents > 0
                    ? t("expenses.documentsCount", { count: row.documents })
                    : "—",
              },
              {
                key: "state",
                header: t("columns.status"),
                render: (row) =>
                  row.kind === "reversal" ? (
                    <Pill tone="neutral">{t("entryStates.reversal")}</Pill>
                  ) : row.reversed ? (
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
                    {row.kind === "expense" && !row.reversed && (
                      <Button variant="ghost" onClick={() => setReversing(row)}>
                        {t("revenue.reverse")}
                      </Button>
                    )}
                    {row.kind === "expense" && (
                      <Button variant="ghost" onClick={() => setAttaching(row)}>
                        {t("revenue.attach")}
                      </Button>
                    )}
                    <AuditHistory table="finance_expenses" id={row.id} />
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

      <ExpenseModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={reload}
      />
      <ReasonModal
        open={Boolean(reversing)}
        onClose={() => setReversing(null)}
        title={t("expenses.reverseTitle", {
          code: recordCode("EX", reversing?.expense_no),
        })}
        body={t("revenue.reverseModal.body")}
        label={t("revenue.reverseModal.reason")}
        confirmLabel={t("revenue.reverse")}
        onConfirm={async (note) => {
          const result = await financeRequest(
            `/api/admin/finance/expenses/${reversing!.id}`,
            { method: "POST", json: { action: "reverse", note } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("revenue.reverseModal.done"));
          reload();
          return null;
        }}
      />
      <DocumentUploadModal
        open={Boolean(attaching)}
        onClose={() => setAttaching(null)}
        onUploaded={reload}
        defaultType="receipt"
        link={
          attaching
            ? {
                kind: "expense",
                id: attaching.id,
                label: `${recordCode("EX", attaching.expense_no)} · ${attaching.supplier_name}`,
              }
            : null
        }
        defaults={
          attaching
            ? {
                title: attaching.document_number ?? attaching.supplier_name,
                counterparty: attaching.supplier_name,
                amount: attaching.amount.toFixed(2),
              }
            : undefined
        }
      />
    </>
  );
}
