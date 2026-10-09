"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import DownloadMenu from "@/components/admin/DownloadMenu";
import { PAYMENT_METHODS, recordCode } from "@/lib/finance/constants";
import { tbilisiDateTime, tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney } from "@/lib/finance/money";
import {
  MAX_SMS_UNITS,
  SMS_CATEGORIES,
  SMS_LEDGER_STATUSES,
  smsKindKey,
  smsUnitCost,
  type SmsExportBlock,
} from "@/lib/finance/sms";
import type {
  SmsLedgerPage,
  SmsPurchase,
  SmsSummary,
  SmsTypeRow,
} from "@/lib/finance/server/sms";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import DataTable from "@/components/admin/finance/DataTable";
import { ReasonModal } from "@/components/admin/finance/EntryModals";
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
  StatCard,
  inputClass,
  textareaClass,
  type Tone,
} from "@/components/admin/finance/ui";

// SMS financial control (C50, owner spec "SMS Control.docx" §3-§8): the uBill
// packages entered by hand, every SMS MyBakuriani sent with its billed units,
// FIFO cost and revenue, the six types, the balance with its forecast and
// low-balance warning, and exports. Every number comes from
// admin_sms_finance_summary / _ledger / _purchases.

const API = "/api/admin/finance/sms";

function groupInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.trunc(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

/** A per-SMS price: 4 decimals at least (0.0300 ₾), up to 6. */
function formatUnitPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const text = Number(value)
    .toFixed(6)
    .replace(/0{1,2}$/, "");
  return `${text} ₾`;
}

const STATUS_TONES: Record<string, Tone> = {
  sent: "info",
  delivered: "success",
  failed: "danger",
};

/** AdminSmsControl.errors first, then the shared finance error words. */
function useSmsErrorText() {
  const t = useTranslations("AdminSmsControl");
  const financeText = useErrorText();
  return (code: string) =>
    t.has(`errors.${code}`) ? t(`errors.${code}`) : financeText(code);
}

function PackageModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("AdminSmsControl");
  const tf = useTranslations("AdminFinances");
  const errorText = useSmsErrorText();
  const [date, setDate] = useState("");
  const [units, setUnits] = useState("");
  const [amount, setAmount] = useState("");
  const [invoice, setInvoice] = useState("");
  const [comment, setComment] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(tbilisiToday());
    setUnits("");
    setAmount("");
    setInvoice("");
    setComment("");
    setMethod("bank_transfer");
    setProblem(null);
  }, [open]);

  const unitCount = /^\d+$/.test(units.trim()) ? Number(units.trim()) : null;
  const total = parseMoney(amount);
  const cost =
    unitCount !== null && total !== null ? smsUnitCost(total, unitCount) : null;
  const valid =
    Boolean(date) &&
    unitCount !== null &&
    unitCount >= 1 &&
    unitCount <= MAX_SMS_UNITS &&
    total !== null &&
    total > 0;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{
      purchase_no: number;
      expense_no: number;
    }>(`${API}/purchases`, {
      method: "POST",
      json: {
        purchased_on: date,
        units: unitCount,
        amount,
        invoice_ref: invoice,
        comment,
        payment_method: method,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(
      t("purchases.created", {
        code: `SP-${result.data.purchase_no}`,
        expense: recordCode("EX", result.data.expense_no),
      }),
    );
    onSaved();
    onClose();
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={t("purchases.add")} size="lg">
      <form
        className="space-y-4"
        data-testid="sms-package-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("purchases.date")}>
            <DateField value={date} max={tbilisiToday()} onChange={setDate} />
          </Field>
          <Field label={t("purchases.units")} htmlFor="sms-units">
            <input
              id="sms-units"
              required
              inputMode="numeric"
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("purchases.amount")} htmlFor="sms-amount">
            <input
              id="sms-amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("purchases.unitCost")} htmlFor="sms-unit-cost">
            <input
              id="sms-unit-cost"
              readOnly
              tabIndex={-1}
              value={cost === null ? "" : formatUnitPrice(cost)}
              placeholder={t("purchases.unitCostAuto")}
              className={`${inputClass} bg-[#F8FAFC]`}
            />
          </Field>
          <Field label={t("purchases.invoice")} htmlFor="sms-invoice">
            <input
              id="sms-invoice"
              maxLength={100}
              value={invoice}
              onChange={(event) => setInvoice(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("purchases.method")} htmlFor="sms-method">
            <Select
              id="sms-method"
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: tf(`methods.${m}`),
              }))}
            />
          </Field>
        </div>
        <Field label={t("purchases.comment")} htmlFor="sms-comment">
          <textarea
            id="sms-comment"
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className={textareaClass}
          />
        </Field>
        <p className="text-[13px] leading-5 text-[#64748B]">
          {t("purchases.expenseNote")}
        </p>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!valid}
        >
          {t("purchases.save")}
        </Button>
      </form>
    </Modal>
  );
}

function ThresholdForm({
  value,
  onSaved,
}: {
  value: number;
  onSaved: () => void;
}) {
  const t = useTranslations("AdminSmsControl");
  const errorText = useSmsErrorText();
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(String(value)), [value]);
  const next = /^\d+$/.test(draft.trim()) ? Number(draft.trim()) : null;
  const changed = next !== null && next !== value && next <= MAX_SMS_UNITS;

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!changed) return;
        setBusy(true);
        const result = await financeRequest(`${API}/settings`, {
          method: "PATCH",
          json: { threshold: next },
        });
        setBusy(false);
        if (!result.ok) {
          toast.error(errorText(result.error.code));
          return;
        }
        toast.success(t("balance.thresholdSaved"));
        onSaved();
      }}
    >
      <Field label={t("balance.threshold")} htmlFor="sms-threshold">
        <input
          id="sms-threshold"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={`${inputClass} w-36`}
        />
      </Field>
      <Button type="submit" loading={busy} disabled={!changed}>
        {t("balance.saveThreshold")}
      </Button>
    </form>
  );
}

type TypeTableRow = SmsTypeRow & { child: boolean; hasKinds: boolean };

export default function SmsControlPage() {
  const t = useTranslations("AdminSmsControl");
  const errorText = useSmsErrorText();
  const { query, filterQuery, page, setPage } = useRegisterQuery();
  const summary = useFinanceQuery<SmsSummary>(`${API}?${filterQuery}`);
  const ledger = useFinanceQuery<
    SmsLedgerPage & { page: number; pageSize: number }
  >(`${API}/ledger?${query}`);
  const purchases = useFinanceQuery<{ rows: SmsPurchase[] }>(
    `${API}/purchases`,
  );
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<SmsPurchase | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const reloadAll = () => {
    summary.reload();
    ledger.reload();
    purchases.reload();
  };
  const exportHref =
    (block: SmsExportBlock) => (scope: string, format: string) => {
      const qs = new URLSearchParams(filterQuery);
      qs.set("block", block);
      qs.set("scope", scope);
      qs.set("format", format);
      return `${API}/export?${qs.toString()}`;
    };
  const exportMenu = (block: SmsExportBlock, primary = false) => (
    <DownloadMenu
      hrefFor={exportHref(block)}
      ariaLabel={t(`export.aria_${block}`)}
      testId={`sms-export-${block}`}
      primary={primary}
      label={block === "all" ? t("export.wholePage") : undefined}
    />
  );
  const kind = (key: string) =>
    t.has(`kinds.${smsKindKey(key)}`) ? t(`kinds.${smsKindKey(key)}`) : key;

  const data = summary.data;
  const k = data?.kpis;
  const b = data?.balance;

  const typeRows: TypeTableRow[] = [];
  for (const row of data?.types ?? []) {
    typeRows.push({ ...row, child: false, hasKinds: row.kinds.length > 0 });
    if (open.has(row.category)) {
      for (const sub of row.kinds) {
        typeRows.push({
          ...sub,
          category: row.category,
          child: true,
          hasKinds: false,
        });
      }
    }
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            {exportMenu("all")}
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setAdding(true)}
              data-testid="sms-add-package"
            >
              {t("purchases.add")}
            </Button>
          </>
        }
      />

      {b?.low && (
        <Notice tone="warning" className="font-semibold">
          {t("balance.lowNotice", {
            remaining: groupInt(b.remaining_units),
            threshold: groupInt(b.threshold),
          })}
        </Notice>
      )}
      {b && b.packages === 0 && (
        <Notice tone="info">{t("balance.noPackages")}</Notice>
      )}
      {b && b.packages > 0 && b.unpriced_units > 0 && (
        <Notice tone="warning">
          {t("balance.unpricedNotice", { units: groupInt(b.unpriced_units) })}
        </Notice>
      )}

      <RegisterFilters
        search={false}
        selects={[
          {
            param: "type",
            label: t("filters.type"),
            options: SMS_CATEGORIES.map((c) => ({
              value: c,
              label: t(`categories.${c}`),
            })),
          },
          {
            param: "status",
            label: t("filters.status"),
            options: SMS_LEDGER_STATUSES.map((s) => ({
              value: s,
              label: t(`statuses.${s}`),
            })),
          },
        ]}
      />

      {summary.loading && !data ? (
        <Skeletons count={4} className="h-28" />
      ) : summary.error ? (
        <ErrorState
          message={errorText(summary.error.code)}
          onRetry={summary.reload}
        />
      ) : data && k && b ? (
        <>
          <Card
            title={t("kpis.title")}
            description={t("kpis.subtitle")}
            actions={exportMenu("kpis")}
          >
            <div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="sms-kpis"
            >
              <StatCard
                label={t("kpis.purchased")}
                value={groupInt(k.purchased_units)}
                hint={t("kpis.packages", { count: k.packages })}
              />
              <StatCard
                label={t("kpis.used")}
                value={groupInt(k.used_units)}
                hint={t("kpis.messagesHint", {
                  count: k.messages,
                  charged: k.charged_messages,
                })}
              />
              <StatCard
                label={t("kpis.remaining")}
                value={groupInt(b.remaining_units)}
                tone={b.low ? "warning" : "neutral"}
                hint={t("kpis.remainingHint")}
              />
              <StatCard
                label={t("kpis.purchaseCost")}
                value={formatMoney(k.purchase_cost)}
              />
              <StatCard
                label={t("kpis.usedCost")}
                value={formatMoney(k.used_cost)}
                hint={
                  k.unpriced_units > 0
                    ? t("kpis.unpricedHint", {
                        units: groupInt(k.unpriced_units),
                      })
                    : t("kpis.usedCostHint")
                }
              />
              <StatCard
                label={t("kpis.revenue")}
                value={formatMoney(k.revenue)}
                hint={t("kpis.cashHint", {
                  amount: formatMoney(k.cash_sales),
                  credits: groupInt(k.cash_credits),
                })}
              />
              <StatCard
                label={t("kpis.profit")}
                value={formatMoney(k.profit)}
                tone={k.profit < 0 ? "danger" : "success"}
                hint={t("kpis.profitHint")}
              />
            </div>
          </Card>

          <Card
            title={t("balance.title")}
            description={t("balance.subtitle")}
            actions={exportMenu("balance")}
          >
            <dl
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="sms-balance"
            >
              {[
                [t("balance.remaining"), groupInt(b.remaining_units)],
                [t("balance.avgPrice"), formatUnitPrice(b.avg_unit_cost)],
                [t("balance.remainingValue"), formatMoney(b.remaining_value)],
                [
                  t("balance.forecast"),
                  b.packages === 0
                    ? t("balance.forecastNoPackages")
                    : b.days_left === null
                      ? t("balance.noForecast")
                      : t("balance.forecastValue", {
                          days: b.days_left,
                          date: b.depletion_date ?? "—",
                        }),
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[13px] font-semibold text-[#64748B]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[18px] font-black tabular-nums text-[#0F172A]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] leading-5 text-[#64748B]">
              {t("balance.dailyLine", {
                daily: b.daily_units_30d,
                purchased: groupInt(b.purchased_units),
                used: groupInt(b.used_units),
              })}
            </p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <ThresholdForm value={b.threshold} onSaved={summary.reload} />
              <Pill tone={b.low ? "warning" : "success"}>
                {b.low ? t("balance.low") : t("balance.ok")}
              </Pill>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-[#64748B]">
              {t("balance.alertHint")}
            </p>
          </Card>

          <Card
            title={t("types.title")}
            description={t("types.hint")}
            actions={exportMenu("types")}
          >
            <div data-testid="sms-types">
              <DataTable
                rows={typeRows}
                rowKey={(row) =>
                  row.child ? `${row.category}:${row.kind}` : row.category
                }
                minWidth={900}
                rowClassName={(row) =>
                  row.child ? "bg-[#F8FAFC] text-[13px]" : undefined
                }
                columns={[
                  {
                    key: "type",
                    header: t("types.type"),
                    className: "min-w-[220px]",
                    render: (row) =>
                      row.child ? (
                        <span className="pl-7 text-[#475569]">
                          {kind(row.kind ?? "")}
                        </span>
                      ) : row.hasKinds ? (
                        <button
                          type="button"
                          className="inline-flex min-h-[44px] items-center gap-1 font-bold text-[#0F172A]"
                          aria-expanded={open.has(row.category)}
                          onClick={() =>
                            setOpen((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.category)) {
                                next.delete(row.category);
                              } else {
                                next.add(row.category);
                              }
                              return next;
                            })
                          }
                        >
                          {open.has(row.category) ? (
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          )}
                          {t(`categories.${row.category}`)}
                        </button>
                      ) : (
                        <span className="inline-flex min-h-[44px] items-center pl-5 font-bold text-[#0F172A]">
                          {t(`categories.${row.category}`)}
                        </span>
                      ),
                  },
                  {
                    key: "messages",
                    header: t("types.messages"),
                    align: "right",
                    render: (row) => groupInt(row.messages),
                  },
                  {
                    key: "units",
                    header: t("types.units"),
                    align: "right",
                    render: (row) => groupInt(row.units),
                  },
                  {
                    key: "statuses",
                    header: t("types.statuses"),
                    className: "whitespace-nowrap",
                    render: (row) =>
                      `${row.sent} / ${row.delivered} / ${row.failed}`,
                  },
                  {
                    key: "cost",
                    header: t("types.cost"),
                    align: "right",
                    className: "whitespace-nowrap",
                    render: (row) => formatMoney(row.cost),
                  },
                  {
                    key: "revenue",
                    header: t("types.revenue"),
                    align: "right",
                    className: "whitespace-nowrap",
                    render: (row) => formatMoney(row.revenue),
                  },
                  {
                    key: "profit",
                    header: t("types.profit"),
                    align: "right",
                    className: "whitespace-nowrap",
                    render: (row) => (
                      <span
                        className={
                          row.profit < 0 ? "text-[#B91C1C]" : "text-[#047857]"
                        }
                      >
                        {formatMoney(row.profit)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </>
      ) : null}

      <Card
        title={t("purchases.title")}
        description={t("purchases.hint")}
        actions={exportMenu("purchases")}
      >
        {purchases.loading && !purchases.data ? (
          <Skeletons count={2} className="h-12" />
        ) : purchases.error ? (
          <ErrorState
            message={errorText(purchases.error.code)}
            onRetry={purchases.reload}
          />
        ) : !purchases.data?.rows.length ? (
          <EmptyState>{t("purchases.empty")}</EmptyState>
        ) : (
          <DataTable
            rows={purchases.data.rows}
            rowKey={(row) => row.id}
            minWidth={1100}
            rowClassName={(row) => (row.active ? undefined : "opacity-60")}
            columns={[
              {
                key: "no",
                header: t("purchases.no"),
                className: "whitespace-nowrap",
                render: (row) => `SP-${row.purchase_no}`,
              },
              {
                key: "date",
                header: t("purchases.date"),
                className: "whitespace-nowrap",
                render: (row) => row.purchased_on,
              },
              {
                key: "units",
                header: t("purchases.units"),
                align: "right",
                render: (row) => groupInt(row.units),
              },
              {
                key: "amount",
                header: t("purchases.amount"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatMoney(row.amount_gel),
              },
              {
                key: "unit",
                header: t("purchases.unitCost"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) => formatUnitPrice(row.unit_cost),
              },
              {
                key: "left",
                header: t("purchases.usedLeft"),
                align: "right",
                className: "whitespace-nowrap",
                render: (row) =>
                  `${groupInt(row.used_units)} / ${groupInt(row.remaining_units)}`,
              },
              {
                key: "invoice",
                header: t("purchases.invoice"),
                render: (row) => row.invoice_ref ?? "—",
              },
              {
                key: "expense",
                header: t("purchases.expense"),
                className: "whitespace-nowrap",
                render: (row) => recordCode("EX", row.expense_no),
              },
              {
                key: "comment",
                header: t("purchases.comment"),
                className: "min-w-[160px]",
                render: (row) =>
                  row.active
                    ? (row.comment ?? "—")
                    : `${row.comment ? `${row.comment} · ` : ""}${t("purchases.voidedBecause", { reason: row.void_reason ?? "" })}`,
              },
              {
                key: "state",
                header: t("purchases.state"),
                render: (row) =>
                  row.active ? (
                    <Pill tone="success">{t("purchases.active")}</Pill>
                  ) : (
                    <Pill tone="neutral">{t("purchases.voided")}</Pill>
                  ),
              },
              {
                key: "actions",
                header: t("purchases.actions"),
                render: (row) =>
                  row.active ? (
                    <Button variant="ghost" onClick={() => setVoiding(row)}>
                      {t("purchases.void")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title={t("ledger.title")}
        description={t("ledger.hint")}
        actions={exportMenu("ledger")}
      >
        <p className="mb-3 text-[13px] text-[#64748B]">
          {ledger.data ? t("ledger.count", { count: ledger.data.count }) : " "}
        </p>
        {ledger.loading && !ledger.data ? (
          <Skeletons count={4} className="h-12" />
        ) : ledger.error ? (
          <ErrorState
            message={errorText(ledger.error.code)}
            onRetry={ledger.reload}
          />
        ) : !ledger.data?.rows.length ? (
          <EmptyState>{t("ledger.empty")}</EmptyState>
        ) : (
          <>
            <DataTable
              rows={ledger.data.rows}
              rowKey={(row) => row.id}
              minWidth={1060}
              columns={[
                {
                  key: "sent",
                  header: t("ledger.sentAt"),
                  className: "whitespace-nowrap",
                  render: (row) => tbilisiDateTime(row.sent_at),
                },
                {
                  key: "type",
                  header: t("types.type"),
                  className: "whitespace-nowrap",
                  render: (row) => t(`categories.${row.category}`),
                },
                {
                  key: "kind",
                  header: t("ledger.kind"),
                  className: "min-w-[180px]",
                  render: (row) =>
                    kind(
                      row.kind === "notification" && row.notification_type
                        ? `notification:${row.notification_type}`
                        : row.kind,
                    ),
                },
                {
                  key: "units",
                  header: t("ledger.units"),
                  align: "right",
                  render: (row) =>
                    row.units === row.segments
                      ? String(row.units)
                      : `${row.units} (${row.segments})`,
                },
                {
                  key: "status",
                  header: t("ledger.status"),
                  render: (row) => (
                    <Pill tone={STATUS_TONES[row.status] ?? "neutral"}>
                      {t(`statuses.${row.status}`)}
                    </Pill>
                  ),
                },
                {
                  key: "credit",
                  header: t("ledger.credit"),
                  render: (row) =>
                    row.credit_charged ? t("ledger.yes") : t("ledger.no"),
                },
                {
                  key: "cost",
                  header: t("types.cost"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) =>
                    row.unpriced_units > 0
                      ? t("ledger.unpriced")
                      : formatUnitPrice(row.cost),
                },
                {
                  key: "revenue",
                  header: t("types.revenue"),
                  align: "right",
                  className: "whitespace-nowrap",
                  render: (row) => formatUnitPrice(row.revenue),
                },
                {
                  key: "sms",
                  header: t("ledger.smsId"),
                  className: "whitespace-nowrap text-[12px] text-[#64748B]",
                  render: (row) => row.provider_message_id ?? "—",
                },
              ]}
            />
            <Pager
              page={page}
              pageSize={ledger.data.pageSize}
              count={ledger.data.count}
              onPage={setPage}
            />
          </>
        )}
      </Card>

      <section className="space-y-1 text-[12px] leading-5 text-[#64748B]">
        <p>{t("export.method")}</p>
        <p>{t("export.limits")}</p>
      </section>

      <PackageModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={reloadAll}
      />
      <ReasonModal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={t("purchases.voidTitle", {
          code: voiding ? `SP-${voiding.purchase_no}` : "",
        })}
        body={t("purchases.voidBody")}
        label={t("purchases.voidReason")}
        confirmLabel={t("purchases.void")}
        onConfirm={async (reason) => {
          const result = await financeRequest(
            `${API}/purchases/${voiding!.id}`,
            { method: "POST", json: { action: "void", reason } },
          );
          if (!result.ok) return errorText(result.error.code);
          toast.success(t("purchases.voidDone"));
          reloadAll();
          return null;
        }}
      />
    </>
  );
}
