import "server-only";
import { parseMoney } from "@/lib/finance/money";
import { TBILISI_OFFSET, isIsoDate, tbilisiToday } from "@/lib/finance/filters";

// HTTP helpers for the finance API routes (C42). The database guards raise
// FINANCE_* messages (supabase/migrations/20261005120000_finance_module.sql)
// and the input readers below throw FinanceInputError; both become
// {error: CODE} with a status the admin pages translate
// (AdminFinances.errors.*).

const NOT_FOUND = new Set([
  "FINANCE_ENTRY_NOT_FOUND",
  "FINANCE_INVOICE_NOT_FOUND",
]);

const CONFLICT = new Set([
  "FINANCE_ALREADY_REVERSED",
  "FINANCE_RECORD_IMMUTABLE",
  "FINANCE_STATUS_TRANSITION",
  "FINANCE_INVOICE_LOCKED",
  "FINANCE_INVOICE_HAS_PAYMENTS",
  "FINANCE_INVOICE_NOT_PAYABLE",
  "FINANCE_REVERSAL_HAS_REFUNDS",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A field the request got wrong; code is invalid_<field>. */
export class FinanceInputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function jsonError(code: string, status: number): Response {
  return Response.json({ error: code }, { status });
}

/** A failure as a response the admin pages can explain. */
export function financeErrorResponse(
  error: unknown,
  context: string,
): Response {
  if (error instanceof FinanceInputError) return jsonError(error.code, 400);
  const err = (error ?? {}) as { message?: string; code?: string };
  const code = /FINANCE_[A-Z_]+/.exec(err.message ?? "")?.[0];
  if (code) {
    const status = NOT_FOUND.has(code) ? 404 : CONFLICT.has(code) ? 409 : 422;
    return jsonError(code, status);
  }
  // Unique keys (an invoice already linked to that payment), foreign keys
  // (a linked record that does not exist) and CHECKs the API did not catch.
  if (err.code === "23505") return jsonError("duplicate", 409);
  if (err.code === "23503") return jsonError("invalid_link", 422);
  if (err.code === "23514" || err.code === "22P02" || err.code === "22023") {
    return jsonError("invalid_request", 422);
  }
  console.error(`[finance] ${context}:`, err.message ?? error);
  return jsonError("server_error", 500);
}

/** The JSON object body of a request, or null. */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Trimmed text; empty or absent is null; longer than max is an error. */
export function readText(
  value: unknown,
  field: string,
  max: number,
  required = false,
): string | null {
  if (value === null || value === undefined) {
    if (required) throw new FinanceInputError(`invalid_${field}`);
    return null;
  }
  if (typeof value !== "string")
    throw new FinanceInputError(`invalid_${field}`);
  const text = value.trim();
  if (text.length > max || (required && !text)) {
    throw new FinanceInputError(`invalid_${field}`);
  }
  return text || null;
}

export function requireText(
  value: unknown,
  field: string,
  max: number,
): string {
  return readText(value, field, max, true) as string;
}

export function readUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new FinanceInputError(`invalid_${field}`);
  }
  return value.toLowerCase();
}

export function readOneOf<T extends string>(
  value: unknown,
  list: readonly T[],
  field: string,
): T {
  if (
    typeof value !== "string" ||
    !(list as readonly string[]).includes(value)
  ) {
    throw new FinanceInputError(`invalid_${field}`);
  }
  return value as T;
}

/** A money amount with at most 2 decimals, within [min, max]. */
export function readMoney(
  value: unknown,
  field: string,
  { min = 0, max = 10_000_000, allowNegative = false } = {},
): number {
  const amount = parseMoney(value, { allowNegative });
  if (amount === null || amount < min || amount > max) {
    throw new FinanceInputError(`invalid_${field}`);
  }
  return amount;
}

/** A Tbilisi calendar day, not in the future unless allowed. */
export function readDate(
  value: unknown,
  field: string,
  { allowFuture = false } = {},
): string {
  if (!isIsoDate(value) || (!allowFuture && value > tbilisiToday())) {
    throw new FinanceInputError(`invalid_${field}`);
  }
  return value;
}

/** "HH:MM" (24 h), or the fallback when absent. */
export function readTime(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new FinanceInputError("invalid_time");
  }
  return value;
}

export function isUuidValue(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * When money moved: a Tbilisi day plus an optional "HH:MM". Today without a
 * time is "now"; another day without one is its noon.
 */
export function readOccurredAt(
  date: unknown,
  time: unknown,
  { allowFuture = false } = {},
): string {
  // An empty date field means "today", like an absent one.
  const day = readDate(
    date === null || date === undefined || date === "" ? tbilisiToday() : date,
    "date",
    { allowFuture },
  );
  if (
    (time === null || time === undefined || time === "") &&
    day === tbilisiToday()
  ) {
    return new Date().toISOString();
  }
  return `${day}T${readTime(time, "12:00")}:00${TBILISI_OFFSET}`;
}
