// Resend marketing contacts (C33). Campaigns are written and sent as Resend
// Broadcasts; this only keeps each contact's `unsubscribed` flag equal to
// profiles.marketing_email_consent. Import-free for scripts/unit.
//
// Needs a FULL-ACCESS Resend key: a sending-only key cannot manage contacts.

export type SyncOutcome =
  | { kind: "done" }
  /** PATCH found no contact: create it instead. */
  | { kind: "missing" }
  | { kind: "retry"; error: string }
  | { kind: "misconfigured"; error: string };

const API = "https://api.resend.com";

export function classifyContactResponse(
  op: "update" | "create",
  status: number,
  body: unknown,
): SyncOutcome {
  const record = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const name = typeof record.name === "string" ? record.name : "";
  const error = `resend contact ${op} ${status}${name ? ` ${name}` : ""}`;
  if (status >= 200 && status < 300) return { kind: "done" };
  if (status === 401 || status === 403) return { kind: "misconfigured", error };
  if (op === "update" && status === 404) return { kind: "missing" };
  return { kind: "retry", error };
}

async function call(
  apiKey: string,
  method: "PATCH" | "POST",
  path: string,
  payload: unknown,
): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  } catch {
    return null;
  }
}

/**
 * Set one contact's broadcast subscription. Update first (the common case
 * once a contact exists); a missing contact is created only when subscribing —
 * there is nothing to unsubscribe for an address Resend never had.
 */
export async function syncResendContact(
  apiKey: string,
  contact: { email: string; name: string | null; subscribed: boolean },
): Promise<Exclude<SyncOutcome, { kind: "missing" }>> {
  const fields = {
    unsubscribed: !contact.subscribed,
    ...(contact.name ? { first_name: contact.name.slice(0, 100) } : {}),
  };
  const updated = await call(
    apiKey,
    "PATCH",
    `/contacts/${encodeURIComponent(contact.email)}`,
    fields,
  );
  if (!updated) return { kind: "retry", error: "resend contact network error" };
  const outcome = classifyContactResponse(
    "update",
    updated.status,
    updated.body,
  );
  if (outcome.kind !== "missing") return outcome;
  if (!contact.subscribed) return { kind: "done" };

  const created = await call(apiKey, "POST", "/contacts", {
    email: contact.email,
    ...fields,
  });
  if (!created) return { kind: "retry", error: "resend contact network error" };
  const result = classifyContactResponse("create", created.status, created.body);
  // "missing" only exists for updates; keep the narrower return type honest.
  return result.kind === "missing"
    ? { kind: "retry", error: "resend contact create 404" }
    : result;
}
