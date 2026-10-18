"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { tbilisiDateTime } from "@/lib/finance/filters";
import {
  financeRequest,
  useErrorText,
  useFinanceQuery,
} from "@/components/admin/finance/api";
import AuditHistory from "@/components/admin/finance/AuditHistory";
import {
  Button,
  Card,
  ErrorState,
  Field,
  Notice,
  PageHeader,
  Skeletons,
  inputClass,
  textareaClass,
} from "@/components/admin/finance/ui";

// Finance settings (C42): the issuer printed on invoices (frozen into each
// invoice when it is issued), the small-business and VAT parameters behind
// the tax pages, and invoice defaults.

type Settings = {
  legal_name: string | null;
  tax_id: string | null;
  legal_address: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_swift: string | null;
  small_business_rate: number;
  small_business_high_rate: number;
  small_business_threshold: number;
  threshold_warning_percent: number;
  vat_registered: boolean;
  vat_rate: number;
  vat_threshold: number;
  invoice_prefix: string;
  invoice_due_days: number;
  invoice_terms: string | null;
  updated_at: string;
};

const TEXT_FIELDS = [
  "legal_name",
  "tax_id",
  "legal_address",
  "email",
  "phone",
  "bank_name",
  "bank_iban",
  "bank_swift",
  "invoice_terms",
  "invoice_prefix",
] as const;

const NUMBER_FIELDS = [
  "small_business_rate",
  "small_business_high_rate",
  "small_business_threshold",
  "threshold_warning_percent",
  "vat_rate",
  "vat_threshold",
  "invoice_due_days",
] as const;

type Form = Record<
  (typeof TEXT_FIELDS)[number] | (typeof NUMBER_FIELDS)[number],
  string
> & { vat_registered: boolean };

function toForm(s: Settings): Form {
  const form = { vat_registered: s.vat_registered } as Form;
  for (const key of TEXT_FIELDS) form[key] = s[key] ?? "";
  for (const key of NUMBER_FIELDS) form[key] = String(s[key]);
  return form;
}

export default function FinanceSettingsPage() {
  const t = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { data, error, loading, reload } = useFinanceQuery<Settings>(
    "/api/admin/finance/settings",
  );
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  if (loading && !form) {
    return (
      <>
        <PageHeader title={t("settings.title")} />
        <Skeletons count={3} className="h-40" />
      </>
    );
  }
  if (error || !form || !data) {
    return (
      <>
        <PageHeader title={t("settings.title")} />
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      </>
    );
  }

  const set = (key: keyof Form) => (value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const text = (
    key: (typeof TEXT_FIELDS)[number],
    label: string,
    max: number,
    hint?: string,
  ) => (
    <Field label={label} htmlFor={`fs-${key}`} hint={hint}>
      <input
        id={`fs-${key}`}
        maxLength={max}
        value={form[key]}
        onChange={(event) => set(key)(event.target.value)}
        className={inputClass}
      />
    </Field>
  );
  const number = (key: (typeof NUMBER_FIELDS)[number], label: string) => (
    <Field label={label} htmlFor={`fs-${key}`}>
      <input
        id={`fs-${key}`}
        inputMode="decimal"
        required
        value={form[key]}
        onChange={(event) => set(key)(event.target.value)}
        className={inputClass}
      />
    </Field>
  );

  async function save() {
    if (!form) return;
    setSaving(true);
    setProblem(null);
    const result = await financeRequest<Settings>(
      "/api/admin/finance/settings",
      { method: "PUT", json: form },
    );
    setSaving(false);
    if (!result.ok) {
      setProblem(errorText(result.error.code));
      return;
    }
    toast.success(t("settings.saved"));
    reload();
  }

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        actions={<AuditHistory table="finance_settings" />}
      />
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Card
          title={t("settings.issuer")}
          description={t("settings.issuerHint")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {text("legal_name", t("settings.legalName"), 200)}
            {text("tax_id", t("settings.taxId"), 50)}
            {text("legal_address", t("settings.address"), 300)}
            {text("email", t("settings.email"), 200)}
            {text("phone", t("settings.phone"), 50)}
            {text("bank_name", t("settings.bankName"), 200)}
            {text("bank_iban", t("settings.iban"), 50)}
            {text("bank_swift", t("settings.swift"), 20)}
          </div>
        </Card>

        <Card title={t("settings.tax")} description={t("settings.taxHint")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {number("small_business_rate", t("settings.rate"))}
            {number("small_business_high_rate", t("settings.highRate"))}
            {number("small_business_threshold", t("settings.threshold"))}
            {number("threshold_warning_percent", t("settings.warning"))}
          </div>
        </Card>

        <Card title={t("settings.vat")} description={t("settings.vatHint")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A] sm:col-span-2 lg:col-span-1">
              <input
                type="checkbox"
                checked={form.vat_registered}
                onChange={(event) =>
                  setForm((f) =>
                    f ? { ...f, vat_registered: event.target.checked } : f,
                  )
                }
                className="h-5 w-5 accent-[#0F172A]"
              />
              {t("settings.vatRegistered")}
            </label>
            {number("vat_rate", t("settings.vatRate"))}
            {number("vat_threshold", t("settings.vatThreshold"))}
          </div>
        </Card>

        <Card title={t("settings.invoices")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text(
              "invoice_prefix",
              t("settings.prefix"),
              8,
              t("settings.prefixHint"),
            )}
            {number("invoice_due_days", t("settings.dueDays"))}
          </div>
          <Field
            label={t("settings.terms")}
            htmlFor="fs-terms"
            className="mt-4"
          >
            <textarea
              id="fs-terms"
              maxLength={2000}
              value={form.invoice_terms}
              onChange={(event) => set("invoice_terms")(event.target.value)}
              className={textareaClass}
            />
          </Field>
        </Card>

        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[#64748B]">
            {t("settings.updatedAt", { at: tbilisiDateTime(data.updated_at) })}
          </p>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </>
  );
}
