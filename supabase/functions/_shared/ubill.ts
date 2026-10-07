// uBill.ge SMS API helpers shared by sms-dispatch, sms-delivery-report and
// auth-send-sms (C18, C48).

export const UBILL_SMS_API = "https://api.ubill.dev/v1/sms";
export const UBILL_TIMEOUT_MS = 10_000;

// Same rule as sms_canonical_ge_phone: exactly a 9-digit mobile, optionally
// prefixed by 995. Never truncate extra digits. Returns 9955XXXXXXXX.
export function toUbillNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^5\d{8}$/.test(digits)) return `995${digits}`;
  if (/^9955\d{8}$/.test(digits)) return digits;
  return null;
}

export interface UbillSendReply {
  http: number;
  statusID: number | null;
  smsID: number | string | null;
  message: string | null;
}

// The one POST to uBill's /send. Throws on a network error or timeout: uBill
// has no idempotency key, so callers treat that as failed and never retry.
// statusID 0 = accepted. `otp` asks uBill for highest-priority delivery and is
// for authentication codes only (uBill may restrict an account that misuses it).
export async function ubillSend(opts: {
  key: string;
  brandId: number;
  number: string;
  text: string;
  stopList: boolean;
  otp?: boolean;
  timeoutMs?: number;
}): Promise<UbillSendReply> {
  const res = await fetch(`${UBILL_SMS_API}/send`, {
    method: "POST",
    headers: { key: opts.key, "Content-Type": "application/json" },
    body: JSON.stringify({
      brandID: opts.brandId,
      numbers: [Number(opts.number)],
      text: opts.text,
      stopList: opts.stopList,
      ...(opts.otp ? { otp: true } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? UBILL_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as {
    statusID?: number;
    smsID?: number | string;
    message?: string;
  } | null;
  return {
    http: res.status,
    statusID: body?.statusID ?? null,
    smsID: body?.smsID ?? null,
    message: body?.message ?? null,
  };
}

// Asks uBill for one message's delivery status, using our own API key.
// Returns the report statusID (0 sent, 1 received, 2 not delivered,
// 3 awaiting, 4 error) or null when uBill gave no usable answer.
export async function fetchUbillReportStatus(
  key: string,
  smsId: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${UBILL_SMS_API}/report/${encodeURIComponent(smsId)}`,
      { headers: { key }, signal: AbortSignal.timeout(UBILL_TIMEOUT_MS) },
    );
    const report = (await res.json().catch(() => null)) as {
      statusID?: number;
      result?: { statusID?: string | number }[];
    } | null;
    if (Number(report?.statusID) !== 0) return null;
    const status = Number(report?.result?.[0]?.statusID);
    return Number.isInteger(status) ? status : null;
  } catch {
    return null;
  }
}
