import "server-only";
import { tetriToGel } from "./amount";
import type { KeepzConfig } from "./config";
import { decryptEnvelope, encryptEnvelope, isKeepzEnvelope } from "./crypto";
import { isKeepzOrderStatus, type KeepzOrderStatus } from "./status";

/**
 * Keepz eCommerce API client (developers.keepz.me → eCommerce integration).
 *
 * The ONLY trusted statement about money is a response to a request made here:
 * TLS to the fixed base URL from config.ts, `redirect: "error"` so nothing can
 * bounce us elsewhere, and a response encrypted to our key whose echoed order
 * id matches the one we asked about. Callback bodies are never trusted (C32).
 */

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_CHARS = 128 * 1024;
/** Hosted checkout pages live on keepz.me; anything else is refused. */
const CHECKOUT_HOST = "keepz.me";

/** Keepz answered with its documented plain-JSON error body. */
export class KeepzApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    readonly group: number | null,
  ) {
    super(
      `Keepz error ${code ?? "?"} (group ${group ?? "?"}, HTTP ${httpStatus})`,
    );
    this.name = "KeepzApiError";
  }
}

/**
 * No verifiable answer: timeout, network failure, a non-Keepz error page, or a
 * response we could not decrypt or match. Whether Keepz acted is UNKNOWN.
 */
export class KeepzUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeepzUnavailableError";
  }
}

/** Documented codes callers branch on. */
export const KEEPZ_ORDER_NOT_FOUND = 6005;

// Groups 1 VALIDATION, 2 BUSINESS_LOGIC, 3 AUTH and 5 RESOURCE_NOT_FOUND mean
// Keepz refused the request itself, and so did nothing; so do 6009–6014 (Keepz
// could not read our envelope). Groups 4, 6 and 7 can happen after Keepz acted.
const REFUSING_GROUPS = new Set([1, 2, 3, 5]);
const UNREADABLE_REQUEST_CODES = new Set([6009, 6010, 6011, 6013, 6014]);

/** True only when Keepz certainly did not act on the request. */
export function isDefinitiveRejection(err: unknown): err is KeepzApiError {
  return (
    err instanceof KeepzApiError &&
    ((err.group !== null && REFUSING_GROUPS.has(err.group)) ||
      (err.code !== null && UNREADABLE_REQUEST_CODES.has(err.code)))
  );
}

/** Log-safe one-liner: codes only, never payloads or keys. */
export function keepzErrorSummary(err: unknown): string {
  if (err instanceof KeepzApiError || err instanceof KeepzUnavailableError) {
    return err.message;
  }
  return err instanceof Error ? err.name : "unknown error";
}

function sameId(value: unknown, expected: string): boolean {
  return (
    typeof value === "string" && value.toLowerCase() === expected.toLowerCase()
  );
}

async function call(
  config: KeepzConfig,
  method: "GET" | "POST",
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const envelope = encryptEnvelope(payload, config.keepzPublicKey);
  const url = new URL(config.baseUrl + path);
  const init: RequestInit = {
    method,
    headers: { Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (method === "POST") {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify({
      identifier: config.integratorId,
      ...envelope,
      aes: true,
    });
  } else {
    url.search = new URLSearchParams({
      identifier: config.integratorId,
      encryptedData: envelope.encryptedData,
      encryptedKeys: envelope.encryptedKeys,
      aes: "true",
    }).toString();
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new KeepzUnavailableError(`${method} ${path}: no response`);
  }
  const text = await response.text().catch(() => "");
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new KeepzUnavailableError(`${method} ${path}: oversized response`);
  }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = (body ?? {}) as Record<string, unknown>;
    const code = typeof error.statusCode === "number" ? error.statusCode : null;
    const group =
      typeof error.exceptionGroup === "number" ? error.exceptionGroup : null;
    if (code === null && group === null) {
      throw new KeepzUnavailableError(
        `${method} ${path}: HTTP ${response.status}`,
      );
    }
    throw new KeepzApiError(response.status, code, group);
  }

  if (!isKeepzEnvelope(body)) {
    throw new KeepzUnavailableError(`${method} ${path}: unexpected response`);
  }
  let plain: unknown;
  try {
    plain = decryptEnvelope(body, config.ownPrivateKey);
  } catch {
    throw new KeepzUnavailableError(
      `${method} ${path}: undecryptable response`,
    );
  }
  if (!plain || typeof plain !== "object" || Array.isArray(plain)) {
    throw new KeepzUnavailableError(`${method} ${path}: unexpected payload`);
  }
  return plain as Record<string, unknown>;
}

function safeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (host !== CHECKOUT_HOST && !host.endsWith(`.${CHECKOUT_HOST}`))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export type KeepzLanguage = "KA" | "EN";

/** POST /api/integrator/order — returns Keepz's hosted checkout URL. */
export async function createOrder(
  config: KeepzConfig,
  input: { orderId: string; amountTetri: number; language: KeepzLanguage },
): Promise<{ checkoutUrl: string }> {
  const result = await call(config, "POST", "/api/integrator/order", {
    amount: tetriToGel(input.amountTetri),
    receiverId: config.receiverId,
    receiverType: "BRANCH",
    integratorId: config.integratorId,
    integratorOrderId: input.orderId,
    currency: "GEL",
    language: input.language,
  });
  if (!sameId(result.integratorOrderId, input.orderId)) {
    throw new KeepzUnavailableError("createOrder: order id mismatch");
  }
  const checkoutUrl = safeCheckoutUrl(result.urlForQR);
  if (!checkoutUrl) {
    let host = "invalid";
    try {
      host = new URL(String(result.urlForQR)).hostname;
    } catch {}
    throw new KeepzUnavailableError(
      `createOrder: refused checkout host ${host}`,
    );
  }
  return { checkoutUrl };
}

/** GET /api/integrator/order/status — the authoritative payment state. */
export async function getOrderStatus(
  config: KeepzConfig,
  orderId: string,
): Promise<{ status: KeepzOrderStatus; transactionId: string | null }> {
  const result = await call(config, "GET", "/api/integrator/order/status", {
    integratorId: config.integratorId,
    integratorOrderId: orderId,
  });
  if (!sameId(result.integratorOrderId, orderId)) {
    throw new KeepzUnavailableError("status: order id mismatch");
  }
  if (!isKeepzOrderStatus(result.status)) {
    throw new KeepzUnavailableError("status: undocumented status");
  }
  const tx = result.transactionId;
  const transactionId =
    (typeof tx === "number" && Number.isSafeInteger(tx) && tx > 0) ||
    (typeof tx === "string" && /^\d{1,20}$/.test(tx))
      ? String(tx)
      : null;
  return { status: result.status, transactionId };
}

/**
 * POST /api/integrator/order/refund/v2. Keepz only acknowledges the request
 * (REFUND_REQUESTED); the result arrives later through getOrderStatus. One
 * BRANCH refundDetails entry is always sent — partial refunds require it (6094).
 */
export async function refundOrder(
  config: KeepzConfig,
  input: { orderId: string; amountTetri: number },
): Promise<void> {
  const amount = tetriToGel(input.amountTetri);
  const result = await call(config, "POST", "/api/integrator/order/refund/v2", {
    integratorId: config.integratorId,
    integratorOrderId: input.orderId,
    amount,
    refundInitiator: "INTEGRATOR",
    refundDetails: [
      {
        receiverType: "BRANCH",
        receiverIdentifier: config.receiverId,
        amount,
      },
    ],
  });
  if (
    !sameId(result.integratorOrderId, input.orderId) ||
    result.status !== "REFUND_REQUESTED"
  ) {
    throw new KeepzUnavailableError("refund: unexpected acknowledgement");
  }
}
