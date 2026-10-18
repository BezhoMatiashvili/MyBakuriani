import "server-only";
import { getTranslations } from "next-intl/server";

/** A Georgian translator for one finance namespace. */
export type FinanceT = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Exports, PDFs and invoice e-mails are always Georgian (the documents an
 * accountant files), whatever language the admin's dashboard is in.
 */
export async function financeT(
  namespace: "AdminFinances" | "AdminInvoices" = "AdminFinances",
): Promise<FinanceT> {
  const t = await getTranslations({ locale: "ka", namespace });
  return (key, values) => t(key, values);
}
