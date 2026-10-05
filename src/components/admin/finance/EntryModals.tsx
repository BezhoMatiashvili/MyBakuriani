"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import TimeField from "@/components/shared/TimeField";
import {
  PAYMENT_METHODS,
  REVENUE_TYPES,
  recordCode,
} from "@/lib/finance/constants";
import { tbilisiToday } from "@/lib/finance/filters";
import { formatMoney, parseMoney, roundMoney } from "@/lib/finance/money";
import { financeRequest, useErrorText } from "./api";
import EntityPicker, { type Entity } from "./EntityPicker";
import { Button, Field, Notice, Select, inputClass, textareaClass } from "./ui";

// Recording money received outside Keepz (spec §2, §4, §6) and the reason
// dialog every reversal, void and cancellation goes through (spec §14).

export type IncomePreset = {
  amount?: string;
  payer?: Entity | null;
  payerName?: string;
  payerTaxId?: string;
  revenueType?: string;
  method?: string;
  reference?: string;
  invoiceId?: string;
  invoiceLabel?: string;
};

export function IncomeModal({
  open,
  onClose,
  onSaved,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  preset?: IncomePreset;
}) {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const [status, setStatus] = useState<"completed" | "pending">("completed");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState("");
  const [ownerAmount, setOwnerAmount] = useState("");
  const [owner, setOwner] = useState<Entity | null>(null);
  const [payer, setPayer] = useState<Entity | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerTaxId, setPayerTaxId] = useState("");
  const [object, setObject] = useState<Entity | null>(null);
  const [revenueType, setRevenueType] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [provider, setProvider] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Reset when the dialog opens, not whenever the parent re-renders.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setStatus("completed");
    setDate("");
    setTime("");
    setAmount(preset?.amount ?? "");
    setOwnerAmount("");
    setOwner(null);
    setPayer(preset?.payer ?? null);
    setPayerName(preset?.payerName ?? "");
    setPayerTaxId(preset?.payerTaxId ?? "");
    setObject(null);
    setRevenueType(preset?.revenueType ?? "");
    setMethod(preset?.method ?? "bank_transfer");
    setProvider("");
    setReference(preset?.reference ?? "");
    setNote("");
    setProblem(null);
  }, [open, preset]);

  const total = parseMoney(amount);
  const share = ownerAmount.trim() ? parseMoney(ownerAmount) : 0;
  const own =
    total !== null && share !== null ? roundMoney(total - share) : null;
  const needsOwner = (share ?? 0) > 0;
  const valid =
    total !== null &&
    total > 0 &&
    share !== null &&
    share <= total &&
    (!needsOwner || owner) &&
    (payer || payerName.trim()) &&
    revenueType;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await financeRequest<{ id: string; entry_no: number }>(
      "/api/admin/finance/entries",
      {
        method: "POST",
        json: {
          kind: "income",
          status,
          occurred_on: date,
          occurred_time: time,
          amount,
          owner_amount: needsOwner ? ownerAmount : "",
          owner_id: needsOwner ? owner?.id : undefined,
          payer_id: payer?.id,
          payer_name: payer ? undefined : payerName,
          payer_tax_id: payerTaxId,
          property_id: object?.kind === "property" ? object.id : undefined,
          service_id: object?.kind === "service" ? object.id : undefined,
          revenue_type: revenueType,
          payment_method: method,
          provider_name: method === "payment_provider" ? provider : undefined,
          reference,
          note,
          invoice_id: preset?.invoiceId,
        },
      },
    );
    setBusy(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(
      t("revenue.incomeModal.created", {
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
      title={t("revenue.incomeModal.title")}
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void submit();
        }}
      >
        {preset?.invoiceLabel && (
          <Notice tone="info">{preset.invoiceLabel}</Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("revenue.incomeModal.status")} htmlFor="inc-status">
            <Select
              id="inc-status"
              value={status}
              onChange={(value) => setStatus(value as typeof status)}
              options={[
                {
                  value: "completed",
                  label: t("revenue.incomeModal.statusCompleted"),
                },
                {
                  value: "pending",
                  label: t("revenue.incomeModal.statusPending"),
                },
              ]}
            />
          </Field>
          <Field
            label={t("revenue.incomeModal.revenueType")}
            htmlFor="inc-type"
          >
            <Select
              id="inc-type"
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
              max={status === "pending" ? undefined : tbilisiToday()}
              clearable
              onChange={setDate}
            />
          </Field>
          <Field label={t("common.time")} hint={t("common.timeHint")}>
            <TimeField value={time} onChange={setTime} />
          </Field>
          <Field label={t("revenue.incomeModal.amount")} htmlFor="inc-amount">
            <input
              id="inc-amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label={t("revenue.incomeModal.ownerAmount")}
            htmlFor="inc-owner-amount"
            hint={t("revenue.incomeModal.ownerAmountHint")}
          >
            <input
              id="inc-owner-amount"
              inputMode="decimal"
              value={ownerAmount}
              placeholder="0"
              onChange={(event) => setOwnerAmount(event.target.value)}
              className={inputClass}
            />
          </Field>
          {needsOwner && (
            <Field
              label={t("revenue.incomeModal.owner")}
              htmlFor="inc-owner"
              className="sm:col-span-2"
            >
              <EntityPicker
                id="inc-owner"
                kinds={["client"]}
                value={owner}
                onChange={setOwner}
                placeholder={t("filters.userPlaceholder")}
              />
            </Field>
          )}
        </div>
        {own !== null && total !== null && total > 0 && (
          <Notice tone={own >= 0 ? "success" : "danger"}>
            {t("revenue.incomeModal.ownShare", { amount: formatMoney(own) })}
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("revenue.incomeModal.payer")} htmlFor="inc-payer">
            <EntityPicker
              id="inc-payer"
              kinds={["client"]}
              value={payer}
              onChange={setPayer}
              placeholder={t("filters.userPlaceholder")}
            />
          </Field>
          {!payer && (
            <Field
              label={t("revenue.incomeModal.payerName")}
              htmlFor="inc-payer-name"
              hint={t("revenue.incomeModal.payerNameHint")}
            >
              <input
                id="inc-payer-name"
                maxLength={200}
                value={payerName}
                onChange={(event) => setPayerName(event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <Field label={t("revenue.incomeModal.payerTaxId")} htmlFor="inc-tax">
            <input
              id="inc-tax"
              maxLength={50}
              value={payerTaxId}
              onChange={(event) => setPayerTaxId(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("revenue.incomeModal.object")} htmlFor="inc-object">
            <EntityPicker
              id="inc-object"
              kinds={["property", "service"]}
              value={object}
              onChange={setObject}
              placeholder={t("filters.objectPlaceholder")}
            />
          </Field>
          <Field label={t("revenue.incomeModal.method")} htmlFor="inc-method">
            <Select
              id="inc-method"
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: t(`methods.${m}`),
              }))}
            />
          </Field>
          {method === "payment_provider" && (
            <Field
              label={t("revenue.incomeModal.provider")}
              htmlFor="inc-provider"
            >
              <input
                id="inc-provider"
                maxLength={100}
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <Field
            label={t("revenue.incomeModal.reference")}
            htmlFor="inc-reference"
          >
            <input
              id="inc-reference"
              maxLength={200}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={t("revenue.incomeModal.note")} htmlFor="inc-note">
          <textarea
            id="inc-note"
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

/**
 * Asks for the reason a record is reversed, voided or cancelled. onConfirm
 * returns an error message to show, or null when done.
 */
export function ReasonModal({
  open,
  onClose,
  title,
  body,
  label,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: ReactNode;
  label: string;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setProblem(null);
    }
  }, [open]);

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reason.trim()) return;
          setBusy(true);
          const failure = await onConfirm(reason.trim());
          setBusy(false);
          if (failure) setProblem(failure);
          else onClose();
        }}
      >
        {body && <Notice tone="warning">{body}</Notice>}
        <Field label={label} htmlFor="reason-text">
          <textarea
            id="reason-text"
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={textareaClass}
          />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={busy}
          disabled={!reason.trim()}
        >
          {confirmLabel}
        </Button>
      </form>
    </Modal>
  );
}
