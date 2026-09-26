// Resend transactional adapter (C33). Import-free so the outcome classifier is
// unit-testable from scripts/unit.
//
// Double-send safety: every request carries Idempotency-Key = email_outbound.id,
// which Resend honours for 24 h. So a retry after an ambiguous failure (timeout,
// 5xx, the process dying before the row is marked) cannot deliver twice, and
// "retry" is the right answer whenever we do not KNOW the send was refused.

export type SendOutcome =
  | { kind: "sent"; providerMessageId: string }
  /** Try the same row again after `retryAfterMs`. */
  | { kind: "retry"; retryAfterMs: number; error: string }
  /** Resend's daily/monthly allowance is spent: park the whole batch. */
  | { kind: "quota"; retryAfterMs: number; error: string }
  /** Definitively refused; retrying the same payload cannot succeed. */
  | { kind: "failed"; error: string }
  /** The API key itself is wrong/revoked: stop the run, keep the row. */
  | { kind: "misconfigured"; error: string };

const MINUTE = 60_000;

/** Classify a Resend HTTP reply (errors: resend.com/docs/api-reference/errors). */
export function classifyResendResponse(
  status: number,
  body: unknown,
): SendOutcome {
  const record = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const name = typeof record.name === "string" ? record.name : "";
  const error = `resend ${status}${name ? ` ${name}` : ""}`;

  if (status >= 200 && status < 300) {
    return typeof record.id === "string" && record.id
      ? { kind: "sent", providerMessageId: record.id }
      : {
          kind: "retry",
          retryAfterMs: 5 * MINUTE,
          error: "resend 2xx without id",
        };
  }
  if (status === 429) {
    if (name === "daily_quota_exceeded") {
      return { kind: "quota", retryAfterMs: 60 * MINUTE, error };
    }
    if (name === "monthly_quota_exceeded") {
      return { kind: "quota", retryAfterMs: 6 * 60 * MINUTE, error };
    }
    return { kind: "retry", retryAfterMs: MINUTE, error };
  }
  if (status === 403 && name === "email_above_quota") {
    return { kind: "quota", retryAfterMs: 60 * MINUTE, error };
  }
  if (status === 401 || status === 403) {
    return { kind: "misconfigured", error };
  }
  // 409 concurrent_idempotent_requests: another attempt with this key is still
  // in flight — wait for it rather than calling it failed.
  if (status === 409) return { kind: "retry", retryAfterMs: 5 * MINUTE, error };
  if (status >= 400 && status < 500) return { kind: "failed", error };
  return { kind: "retry", retryAfterMs: 5 * MINUTE, error };
}

export type ResendMessage = {
  id: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
};

export async function sendWithResend(
  apiKey: string,
  message: ResendMessage,
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.id,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        tags: [
          { name: "type", value: message.tag.replace(/[^A-Za-z0-9_-]/g, "_") },
        ],
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return {
      kind: "retry",
      retryAfterMs: 5 * MINUTE,
      error: "resend network error",
    };
  }
  const body = await response.json().catch(() => null);
  return classifyResendResponse(response.status, body);
}
