"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useErrorText, useFinanceQuery } from "@/components/admin/finance/api";
import InvoiceForm, {
  type InvoiceFields,
} from "@/components/admin/finance/InvoiceForm";
import {
  ErrorState,
  Notice,
  PageHeader,
  Skeletons,
  buttonClass,
} from "@/components/admin/finance/ui";

// Edit a draft invoice (spec §15, C42). An issued invoice is frozen: it is
// cancelled and duplicated instead.
export default function EditInvoicePage() {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const errorText = useErrorText();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useFinanceQuery<{
    invoice: InvoiceFields & {
      status: string;
      recipient_name: string;
      recipient_profile_id: string | null;
    };
  }>(`/api/admin/finance/invoices/${id}`);
  const back = `/dashboard/admin/finances/invoices/${id}`;

  const header = (
    <PageHeader
      title={t("form.titleEdit")}
      actions={
        <Link href={back} className={buttonClass()}>
          {tf("common.back")}
        </Link>
      }
    />
  );
  if (loading && !data) {
    return (
      <>
        {header}
        <Skeletons count={3} className="h-40" />
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        {header}
        <ErrorState
          message={errorText(error?.code ?? "generic")}
          onRetry={reload}
        />
      </>
    );
  }
  const { invoice } = data;
  if (invoice.status !== "draft") {
    return (
      <>
        {header}
        <Notice tone="warning">{errorText("FINANCE_INVOICE_LOCKED")}</Notice>
      </>
    );
  }
  return (
    <>
      {header}
      <InvoiceForm
        invoiceId={id}
        initial={invoice}
        initialRecipient={
          invoice.recipient_profile_id
            ? {
                kind: "client",
                id: invoice.recipient_profile_id,
                label: invoice.recipient_name,
              }
            : null
        }
      />
    </>
  );
}
