"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import Modal from "@/components/shared/Modal";
import DateField from "@/components/shared/DateField";
import {
  MAX_INVOICE_ITEMS,
  PAYMENT_METHODS,
  RECIPIENT_TYPES,
} from "@/lib/finance/constants";
import { tbilisiToday } from "@/lib/finance/filters";
import {
  formatMoney,
  formatPercent,
  parseMoney,
  priceInvoice,
} from "@/lib/finance/money";
import { financeRequest, useErrorText, useFinanceQuery } from "./api";
import EntityPicker, { type Entity } from "./EntityPicker";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Notice,
  Select,
  Skeletons,
  inputClass,
  textareaClass,
} from "./ui";

// The invoice form (spec §15) for new invoices and draft edits. Totals are
// priced exactly as the database prices them (priceInvoice); a VAT line
// appears only while MyBakuriani is VAT-registered.

export type InvoiceFields = {
  recipient_type?: string;
  recipient_name?: string | null;
  recipient_tax_id?: string | null;
  recipient_address?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  recipient_profile_id?: string | null;
  items?: { description?: unknown; quantity?: unknown; unit_price?: unknown }[];
  discount_amount?: number | null;
  payment_method?: string | null;
  due_date?: string | null;
  related_reference?: string | null;
  notes?: string | null;
  terms?: string | null;
};

type Line = { description: string; quantity: string; unit_price: string };
type PricedLine = { description: string; quantity: number; unit_price: number };

type Template = { id: string; name: string; payload: InvoiceFields };

type Settings = {
  vat_registered: boolean;
  vat_rate: number;
  invoice_due_days: number;
};

const BASE = "/dashboard/admin/finances/invoices";
const EMPTY_LINE: Line = { description: "", quantity: "1", unit_price: "" };

function toLines(items: InvoiceFields["items"]): Line[] {
  const lines = (items ?? []).map((item) => ({
    description: String(item.description ?? ""),
    quantity: String(item.quantity ?? "1"),
    unit_price:
      item.unit_price === null || item.unit_price === undefined
        ? ""
        : String(item.unit_price),
  }));
  return lines.length ? lines : [{ ...EMPTY_LINE }];
}

function quantityOf(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(clean)) return null;
  const value = Number(clean);
  return value > 0 ? value : null;
}

export default function InvoiceForm({
  invoiceId,
  initial,
  initialRecipient,
  templateId,
}: {
  /** Set when editing a draft. */
  invoiceId?: string;
  initial?: InvoiceFields;
  initialRecipient?: Entity | null;
  templateId?: string | null;
}) {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const router = useRouter();
  const settings = useFinanceQuery<Settings>("/api/admin/finance/settings");
  const templates = useFinanceQuery<{ rows: Template[] }>(
    "/api/admin/finance/invoice-templates",
  );

  const [recipientType, setRecipientType] = useState(
    initial?.recipient_type ?? "company",
  );
  const [recipientUser, setRecipientUser] = useState<Entity | null>(
    initialRecipient ?? null,
  );
  const [name, setName] = useState(initial?.recipient_name ?? "");
  const [taxId, setTaxId] = useState(initial?.recipient_tax_id ?? "");
  const [address, setAddress] = useState(initial?.recipient_address ?? "");
  const [email, setEmail] = useState(initial?.recipient_email ?? "");
  const [phone, setPhone] = useState(initial?.recipient_phone ?? "");
  const [lines, setLines] = useState<Line[]>(toLines(initial?.items));
  const [discount, setDiscount] = useState(
    initial?.discount_amount ? String(initial.discount_amount) : "",
  );
  const [method, setMethod] = useState(initial?.payment_method ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [reference, setReference] = useState(initial?.related_reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [busy, setBusy] = useState<"draft" | "issue" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  function apply(fields: InvoiceFields) {
    if (fields.recipient_type) setRecipientType(fields.recipient_type);
    if (fields.recipient_name) setName(fields.recipient_name);
    if (fields.recipient_tax_id) setTaxId(fields.recipient_tax_id);
    if (fields.recipient_address) setAddress(fields.recipient_address);
    if (fields.recipient_email) setEmail(fields.recipient_email);
    if (fields.recipient_phone) setPhone(fields.recipient_phone);
    if (fields.items?.length) setLines(toLines(fields.items));
    if (fields.discount_amount) setDiscount(String(fields.discount_amount));
    if (fields.payment_method) setMethod(fields.payment_method);
    if (fields.related_reference) setReference(fields.related_reference);
    if (fields.notes) setNotes(fields.notes);
    if (fields.terms) setTerms(fields.terms);
  }

  // A template named in the URL (Templates → Use) fills the form once.
  const appliedTemplate = useRef(false);
  useEffect(() => {
    if (!templateId || appliedTemplate.current || !templates.data) return;
    const template = templates.data.rows.find((row) => row.id === templateId);
    if (template) {
      apply(template.payload);
      appliedTemplate.current = true;
    }
  }, [templateId, templates.data]);

  const vatRate =
    settings.data?.vat_registered && settings.data.vat_rate > 0
      ? settings.data.vat_rate
      : null;

  const priced = useMemo(() => {
    const parsed = lines.map((line) => ({
      description: line.description.trim(),
      quantity: quantityOf(line.quantity),
      unit_price: parseMoney(line.unit_price),
    }));
    const priceable = (line: (typeof parsed)[number]): line is PricedLine =>
      line.quantity !== null && line.unit_price !== null;
    const discountValue = discount.trim() ? parseMoney(discount) : 0;
    const result = priceInvoice(
      parsed.filter(priceable),
      discountValue ?? 0,
      vatRate,
    );
    const complete = parsed.every(
      (line) =>
        priceable(line) &&
        line.description.length > 0 &&
        line.description.length <= 300,
    );
    return {
      result,
      lineTotals: parsed.map((line) =>
        priceable(line) ? priceInvoice([line], 0, null).subtotal : null,
      ),
      valid:
        complete &&
        discountValue !== null &&
        discountValue <= result.subtotal &&
        result.total > 0,
    };
  }, [lines, discount, vatRate]);

  const payload = () => ({
    recipient_type: recipientType,
    recipient_name: name,
    recipient_tax_id: taxId,
    recipient_address: address,
    recipient_email: email,
    recipient_phone: phone,
    recipient_profile_id: recipientUser?.id ?? null,
    items: lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
    })),
    discount_amount: discount,
    payment_method: method,
    due_date: dueDate,
    related_reference: reference,
    notes,
    terms,
  });

  const canSave = Boolean(name.trim()) && priced.valid;

  async function save(issue: boolean) {
    setBusy(issue ? "issue" : "draft");
    setProblem(null);
    let id = invoiceId;
    if (invoiceId) {
      const updated = await financeRequest(
        `/api/admin/finance/invoices/${invoiceId}`,
        { method: "PUT", json: payload() },
      );
      if (!updated.ok) {
        setBusy(null);
        setProblem(errorText(updated.error.code));
        return;
      }
      if (issue) {
        const issued = await financeRequest<{
          invoice_number: string;
          archived: boolean;
        }>(`/api/admin/finance/invoices/${invoiceId}`, {
          method: "POST",
          json: { action: "issue" },
        });
        if (!issued.ok) {
          setBusy(null);
          setProblem(errorText(issued.error.code));
          return;
        }
        toast.success(
          t("detail.issuedToast", { number: issued.data.invoice_number }),
        );
        if (!issued.data.archived) toast.warning(t("detail.archiveFailed"));
      } else {
        toast.success(t("form.saved"));
      }
    } else {
      const created = await financeRequest<{
        id: string;
        invoice_number?: string;
        archived?: boolean;
        issueError?: string;
      }>("/api/admin/finance/invoices", {
        method: "POST",
        json: { ...payload(), issue },
      });
      if (!created.ok) {
        setBusy(null);
        setProblem(errorText(created.error.code));
        return;
      }
      id = created.data.id;
      if (created.data.issueError) {
        // The draft is kept: open it so the problem can be fixed there.
        toast.error(errorText(created.data.issueError));
      } else if (created.data.invoice_number) {
        toast.success(
          t("detail.issuedToast", { number: created.data.invoice_number }),
        );
        if (!created.data.archived) toast.warning(t("detail.archiveFailed"));
      } else {
        toast.success(t("form.saved"));
      }
    }
    setBusy(null);
    router.push(`${BASE}/${id}`);
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    // The server keeps only template fields (not the recipient account or
    // the due date).
    const fields = payload();
    const result = await financeRequest(
      "/api/admin/finance/invoice-templates",
      {
        method: "POST",
        json: {
          name: templateName,
          payload: {
            ...fields,
            items: fields.items.filter((item) => item.description.trim()),
          },
        },
      },
    );
    setSavingTemplate(false);
    if (!result.ok) {
      toast.error(errorText(result.error.code));
      return;
    }
    toast.success(t("form.templateSaved"));
    setTemplateName("");
    templates.reload();
  }

  if (settings.loading && !settings.data) {
    return <Skeletons count={3} className="h-40" />;
  }
  if (settings.error) {
    return (
      <ErrorState
        message={errorText(settings.error.code)}
        onRetry={settings.reload}
      />
    );
  }

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((all) =>
      all.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void save(false);
      }}
    >
      {(templates.data?.rows.length ?? 0) > 0 && (
        <Card>
          <Field label={t("form.useTemplate")} htmlFor="inv-template">
            <Select
              id="inv-template"
              value=""
              placeholder={tf("common.select")}
              options={(templates.data?.rows ?? []).map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              onChange={(value) => {
                const template = templates.data?.rows.find(
                  (row) => row.id === value,
                );
                if (template) {
                  apply(template.payload);
                  toast.success(t("form.templateApplied"));
                }
              }}
            />
          </Field>
        </Card>
      )}

      <Card title={t("form.recipient")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.recipientType")} htmlFor="inv-rtype">
            <Select
              id="inv-rtype"
              value={recipientType}
              onChange={setRecipientType}
              options={RECIPIENT_TYPES.map((type) => ({
                value: type,
                label: t(`form.${type}`),
              }))}
            />
          </Field>
          <Field label={t("form.recipientUser")} htmlFor="inv-ruser">
            <EntityPicker
              id="inv-ruser"
              kinds={["client"]}
              value={recipientUser}
              onChange={(entity) => {
                setRecipientUser(entity);
                if (entity && !name.trim()) setName(entity.label);
                if (entity?.sublabel && !phone.trim())
                  setPhone(entity.sublabel);
              }}
              placeholder={tf("filters.userPlaceholder")}
            />
          </Field>
          <Field label={t("form.recipientName")} htmlFor="inv-rname">
            <input
              id="inv-rname"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.recipientTaxId")} htmlFor="inv-rtax">
            <input
              id="inv-rtax"
              maxLength={50}
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.recipientAddress")} htmlFor="inv-raddr">
            <input
              id="inv-raddr"
              maxLength={300}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.recipientEmail")} htmlFor="inv-remail">
            <input
              id="inv-remail"
              type="email"
              maxLength={200}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.recipientPhone")} htmlFor="inv-rphone">
            <input
              id="inv-rphone"
              type="tel"
              maxLength={50}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card title={t("form.items")}>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-xl border border-[#F1F5F9] p-3 sm:grid-cols-[minmax(0,1fr)_110px_150px_120px_44px] sm:items-end sm:border-0 sm:p-0"
            >
              <Field label={t("form.description")} htmlFor={`inv-d-${index}`}>
                <input
                  id={`inv-d-${index}`}
                  maxLength={300}
                  value={line.description}
                  onChange={(event) =>
                    setLine(index, { description: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("form.quantity")} htmlFor={`inv-q-${index}`}>
                <input
                  id={`inv-q-${index}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    setLine(index, { quantity: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("form.unitPrice")} htmlFor={`inv-p-${index}`}>
                <input
                  id={`inv-p-${index}`}
                  inputMode="decimal"
                  value={line.unit_price}
                  onChange={(event) =>
                    setLine(index, { unit_price: event.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field label={t("form.lineTotal")}>
                <p className="flex min-h-[44px] items-center justify-end rounded-xl bg-[#F8FAFC] px-3 text-[14px] font-semibold tabular-nums">
                  {formatMoney(priced.lineTotals[index])}
                </p>
              </Field>
              <button
                type="button"
                aria-label={t("form.removeItem")}
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((all) => all.filter((_, i) => i !== index))
                }
                className="flex size-11 items-center justify-center self-end rounded-xl text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button
            icon={<Plus className="h-4 w-4" />}
            disabled={lines.length >= MAX_INVOICE_ITEMS}
            onClick={() => setLines((all) => [...all, { ...EMPTY_LINE }])}
          >
            {t("form.addItem")}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 border-t border-[#F1F5F9] pt-4 sm:grid-cols-2">
          <Field label={t("form.discount")} htmlFor="inv-discount">
            <input
              id="inv-discount"
              inputMode="decimal"
              placeholder="0"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className={inputClass}
            />
          </Field>
          <dl className="space-y-1.5 rounded-xl bg-[#F8FAFC] p-4 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[#64748B]">{t("form.subtotal")}</dt>
              <dd className="tabular-nums">
                {formatMoney(priced.result.subtotal)}
              </dd>
            </div>
            {priced.result.discount > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-[#64748B]">{t("form.discount")}</dt>
                <dd className="tabular-nums">
                  −{formatMoney(priced.result.discount)}
                </dd>
              </div>
            )}
            {vatRate !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-[#64748B]">
                  {t("form.vat", { rate: formatPercent(vatRate) })}
                </dt>
                <dd className="tabular-nums">
                  {formatMoney(priced.result.vat)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-[#E2E8F0] pt-2 text-[16px] font-black">
              <dt>{t("form.total")}</dt>
              <dd className="tabular-nums">
                {formatMoney(priced.result.total)}
              </dd>
            </div>
          </dl>
        </div>
        {vatRate === null && (
          <p className="mt-3 text-[12px] text-[#64748B]">{t("form.vatOff")}</p>
        )}
      </Card>

      <Card title={t("form.payment")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.paymentMethod")} htmlFor="inv-method">
            <Select
              id="inv-method"
              value={method}
              onChange={setMethod}
              placeholder={t("form.noMethod")}
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: tf(`methods.${m}`),
              }))}
            />
          </Field>
          <Field
            label={t("form.dueDate")}
            hint={t("form.dueDateHint", {
              days: settings.data?.invoice_due_days ?? 14,
            })}
          >
            <DateField
              value={dueDate}
              min={tbilisiToday()}
              clearable
              onChange={setDueDate}
            />
          </Field>
        </div>
      </Card>

      <Card title={t("form.references")}>
        <div className="grid gap-4">
          <Field label={t("form.relatedReference")} htmlFor="inv-ref">
            <input
              id="inv-ref"
              maxLength={100}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("form.notes")} htmlFor="inv-notes">
            <textarea
              id="inv-notes"
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={textareaClass}
            />
          </Field>
          <Field
            label={t("form.terms")}
            htmlFor="inv-terms"
            hint={t("form.termsHint")}
          >
            <textarea
              id="inv-terms"
              maxLength={2000}
              value={terms}
              onChange={(event) => setTerms(event.target.value)}
              className={textareaClass}
            />
          </Field>
        </div>
      </Card>

      <Notice tone="neutral">{t("notRs")}</Notice>
      {problem && <Notice tone="danger">{problem}</Notice>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("form.templateName")} htmlFor="inv-tname">
            <input
              id="inv-tname"
              maxLength={120}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className={`${inputClass} w-[220px]`}
            />
          </Field>
          <Button
            loading={savingTemplate}
            disabled={!templateName.trim()}
            onClick={saveTemplate}
          >
            {t("form.saveTemplate")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            loading={busy === "draft"}
            disabled={!canSave || busy !== null}
          >
            {t("form.saveDraft")}
          </Button>
          <Button
            variant="primary"
            loading={busy === "issue"}
            disabled={!canSave || busy !== null}
            onClick={() => setConfirmIssue(true)}
          >
            {t("form.saveIssue")}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        title={t("detail.issue")}
        size="sm"
      >
        <div className="space-y-4">
          <Notice tone="warning">{t("detail.confirmIssue")}</Notice>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setConfirmIssue(false);
              void save(true);
            }}
          >
            {t("form.saveIssue")}
          </Button>
        </div>
      </Modal>
    </form>
  );
}
