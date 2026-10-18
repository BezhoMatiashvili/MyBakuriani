import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/finance/server/data";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readJsonObject,
  readMoney,
  readText,
} from "@/lib/finance/server/http";

export const runtime = "nodejs";

// Finance settings (C42): the issuer printed on invoices (snapshotted when an
// invoice is issued, so later edits never change it), the small-business and
// VAT parameters behind the tax pages, and invoice defaults.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  try {
    return Response.json(await loadSettings(createServiceClient()));
  } catch (error) {
    return financeErrorResponse(error, "settings read");
  }
}

function percent(value: unknown, field: string, min = 0, max = 100): number {
  const n = readMoney(value, field, { max });
  if (n < min) throw new FinanceInputError(`invalid_${field}`);
  return n;
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = await readJsonObject(request);
  if (!body) return jsonError("invalid_request", 400);

  try {
    const email = readText(body.email, "email", 200);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new FinanceInputError("invalid_email");
    }
    const prefix =
      typeof body.invoice_prefix === "string"
        ? body.invoice_prefix.trim().toUpperCase()
        : "";
    if (!/^[A-Z0-9]{1,8}$/.test(prefix)) {
      throw new FinanceInputError("invalid_invoice_prefix");
    }
    const dueDays = Number(body.invoice_due_days);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      throw new FinanceInputError("invalid_invoice_due_days");
    }
    if (typeof body.vat_registered !== "boolean") {
      throw new FinanceInputError("invalid_vat_registered");
    }
    const warn = percent(
      body.threshold_warning_percent,
      "warning_percent",
      1,
      99,
    );

    const { data, error } = await createServiceClient(guard.admin.userId)
      .from("finance_settings")
      .update({
        legal_name: readText(body.legal_name, "legal_name", 200),
        tax_id: readText(body.tax_id, "tax_id", 50),
        legal_address: readText(body.legal_address, "address", 300),
        email,
        phone: readText(body.phone, "phone", 50),
        bank_name: readText(body.bank_name, "bank_name", 200),
        bank_iban: readText(body.bank_iban, "iban", 50),
        bank_swift: readText(body.bank_swift, "swift", 20),
        small_business_rate: percent(body.small_business_rate, "rate"),
        small_business_high_rate: percent(
          body.small_business_high_rate,
          "high_rate",
        ),
        small_business_threshold: readMoney(
          body.small_business_threshold,
          "threshold",
          { min: 1, max: 1_000_000_000 },
        ),
        threshold_warning_percent: warn,
        vat_registered: body.vat_registered,
        vat_rate: percent(body.vat_rate, "vat_rate"),
        vat_threshold: readMoney(body.vat_threshold, "vat_threshold", {
          min: 1,
          max: 1_000_000_000,
        }),
        invoice_prefix: prefix,
        invoice_due_days: dueDays,
        invoice_terms: readText(body.invoice_terms, "terms", 2000),
        updated_at: new Date().toISOString(),
        updated_by: guard.admin.userId,
      })
      .eq("id", true)
      .select("*")
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return financeErrorResponse(error, "settings update");
  }
}
