"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import InvoiceForm from "@/components/admin/finance/InvoiceForm";
import { PageHeader, buttonClass } from "@/components/admin/finance/ui";

// New invoice (spec §15, C42); ?template=<id> starts from a template.
export default function NewInvoicePage() {
  const t = useTranslations("AdminInvoices");
  const tf = useTranslations("AdminFinances");
  const templateId = useSearchParams().get("template");
  return (
    <>
      <PageHeader
        title={t("form.titleNew")}
        subtitle={t("subtitle")}
        actions={
          <Link
            href="/dashboard/admin/finances/invoices"
            className={buttonClass()}
          >
            {tf("common.back")}
          </Link>
        }
      />
      <InvoiceForm templateId={templateId} />
    </>
  );
}
