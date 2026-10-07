// Supabase Auth "Send SMS" hook (C48): phone sign-in and phone-change codes go
// out through uBill straight away (never through the sms_outbound queue, whose
// one-minute poll is too slow for a code and whose rows admins can read).
//
// Auth generates and later verifies the code; this function only delivers it.
// Order: signature (fail closed) -> Georgian mobile only (the toll-fraud brake)
// -> delivery switches as in sms-dispatch -> caps + idempotency in SQL
// (auth_sms_code_reserve) -> one uBill send -> settle the log row.
//
// Auth's contract (supabase/auth internal/hooks): the whole call has 5 s; an
// HTTP 200 with {"error":{"http_code","message"}} reaches the browser as that
// status + message; any other status is a generic 500, and 429/503 with a
// retry-after header make Auth call again. So every answer to a verified call
// is a 200, and refusals carry an AUTH_SMS_ERRORS token. The code itself is
// never logged.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { buildAuthCode } from "../sms-automation-run/domain.ts";
import { AUTH_SMS_ERRORS, type AuthSmsError } from "../_shared/auth-sms.ts";
import { toUbillNumber, type UbillSendReply } from "../_shared/ubill.ts";

// Leaves room inside Auth's 5 s for the edge cold start and two RPCs.
export const SEND_TIMEOUT_MS = 3_000;

export type CodeKind = "sign_in" | "phone_change";

export type Reservation =
  | { ok: true; id: string; duplicate?: boolean }
  | { ok: false; reason: "number_limit" | "ip_limit" | "site_limit" };

export interface HookDeps {
  env(name: string): string | undefined;
  reserve(args: {
    hookId: string;
    phone: string;
    ip: string | null;
    userId: string | null;
    kind: CodeKind;
  }): Promise<Reservation>;
  settle(
    id: string,
    sent: boolean,
    providerMessageId: string | null,
  ): Promise<void>;
  send(opts: {
    key: string;
    brandId: number;
    number: string;
    text: string;
    stopList: boolean;
    otp: boolean;
    timeoutMs: number;
  }): Promise<UbillSendReply>;
  log(message: string, data?: Record<string, unknown>): void;
}

interface SendSmsEvent {
  metadata?: { uuid?: string; ip_address?: string };
  user?: { id?: string; phone?: string };
  sms?: { otp?: string; phone?: string };
}

const REFUSAL_FOR: Record<
  Exclude<Reservation, { ok: true }>["reason"],
  [AuthSmsError, number]
> = {
  number_limit: [AUTH_SMS_ERRORS.numberLimit, 429],
  ip_limit: [AUTH_SMS_ERRORS.ipLimit, 429],
  site_limit: [AUTH_SMS_ERRORS.unavailable, 503],
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function refuse(token: AuthSmsError, httpCode: number): Response {
  return json({ error: { http_code: httpCode, message: token } });
}

/** 9955XXXXXXXX -> 995555****12 for logs. */
export function maskNumber(number: string): string {
  return `${number.slice(0, 6)}****${number.slice(-2)}`;
}

function siteHost(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).host || null;
  } catch {
    return null;
  }
}

function testRecipients(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  return new Set(
    raw
      .split(",")
      .map((n) => toUbillNumber(n))
      .filter((n): n is string => !!n),
  );
}

// Supabase shows the secret as "v1,whsec_<base64>"; several may be joined
// with "|" while one is rotated.
function verify(
  payload: string,
  headers: Headers,
  secrets: string,
): SendSmsEvent | null {
  const raw = Object.fromEntries(headers);
  for (const secret of secrets.split("|")) {
    const base64 = secret.trim().replace(/^v1,whsec_/, "");
    if (!base64) continue;
    try {
      return new Webhook(base64).verify(payload, raw) as SendSmsEvent;
    } catch {
      /* try the next secret */
    }
  }
  return null;
}

export async function handleSendSms(
  req: Request,
  deps: HookDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const secrets = deps.env("SEND_SMS_HOOK_SECRET");
  if (!secrets) {
    deps.log("auth-send-sms: SEND_SMS_HOOK_SECRET is not set; refusing");
    return refuse(AUTH_SMS_ERRORS.unavailable, 503);
  }
  const event = verify(await req.text(), req.headers, secrets);
  if (!event) {
    return new Response("invalid signature", { status: 401 });
  }

  // sms.phone is the number Auth wants the code at: the new one on a phone change.
  const target = toUbillNumber(
    String(event.sms?.phone || event.user?.phone || ""),
  );
  if (!target) return refuse(AUTH_SMS_ERRORS.phoneNotSupported, 400);
  const code = String(event.sms?.otp ?? "");
  if (!/^\d{4,10}$/.test(code)) {
    deps.log("auth-send-sms: payload without a usable code");
    return refuse(AUTH_SMS_ERRORS.sendFailed, 500);
  }

  const key = deps.env("SMS_PROVIDER_API_KEY");
  const brandId = Number(deps.env("SMS_PROVIDER_BRAND_ID"));
  if (
    deps.env("SMS_DELIVERY_ENABLED") !== "true" ||
    !key ||
    !Number.isInteger(brandId) ||
    brandId <= 0
  ) {
    deps.log("auth-send-sms: delivery disabled or provider not configured");
    return refuse(AUTH_SMS_ERRORS.unavailable, 503);
  }
  const allowlist = testRecipients(deps.env("SMS_TEST_RECIPIENTS"));
  if (allowlist && !allowlist.has(target)) {
    deps.log("auth-send-sms: recipient not allow-listed", {
      phone: maskNumber(target),
    });
    return refuse(AUTH_SMS_ERRORS.unavailable, 503);
  }

  const kind: CodeKind =
    toUbillNumber(String(event.user?.phone ?? "")) === target
      ? "sign_in"
      : "phone_change";

  let reservation: Reservation;
  try {
    reservation = await deps.reserve({
      hookId: event.metadata?.uuid || crypto.randomUUID(),
      phone: target,
      ip: event.metadata?.ip_address || null,
      userId: event.user?.id || null,
      kind,
    });
  } catch (err) {
    deps.log("auth-send-sms: reserve failed", {
      error: String(err).slice(0, 200),
    });
    return refuse(AUTH_SMS_ERRORS.unavailable, 503);
  }
  if (!reservation.ok) {
    deps.log("auth-send-sms: refused", {
      reason: reservation.reason,
      phone: maskNumber(target),
    });
    const [token, status] = REFUSAL_FOR[reservation.reason];
    return refuse(token, status);
  }
  // Auth retried a call we already took: the first attempt sends (or sent) it.
  if (reservation.duplicate) return json({});

  const host = siteHost(deps.env("SITE_URL"));
  let reply: UbillSendReply;
  try {
    reply = await deps.send({
      key,
      brandId,
      number: target,
      text: buildAuthCode(code, host),
      // A code the user just asked for goes out even if the number opted out
      // of marketing; otp = uBill's highest-priority lane for auth codes.
      stopList: false,
      otp: true,
      timeoutMs: SEND_TIMEOUT_MS,
    });
  } catch (err) {
    await deps.settle(reservation.id, false, null).catch(() => {});
    deps.log("auth-send-sms: provider unreachable", {
      phone: maskNumber(target),
      error: String(err).slice(0, 200),
    });
    return refuse(AUTH_SMS_ERRORS.sendFailed, 502);
  }

  const accepted =
    reply.http >= 200 &&
    reply.http < 300 &&
    Number(reply.statusID) === 0 &&
    reply.smsID != null;
  await deps
    .settle(reservation.id, accepted, accepted ? String(reply.smsID) : null)
    .catch((err) =>
      deps.log("auth-send-sms: settle failed", {
        error: String(err).slice(0, 200),
      }),
    );
  if (!accepted) {
    deps.log("auth-send-sms: provider refused", {
      phone: maskNumber(target),
      http: reply.http,
      statusID: reply.statusID,
      message: reply.message,
    });
    return refuse(AUTH_SMS_ERRORS.sendFailed, 502);
  }
  deps.log("auth-send-sms: sent", {
    phone: maskNumber(target),
    smsID: reply.smsID,
    kind,
  });
  return json({});
}
