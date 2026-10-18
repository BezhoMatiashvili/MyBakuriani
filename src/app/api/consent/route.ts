import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { CONSENT_KINDS } from "@/lib/consent/channels";

export const runtime = "nodejs";

/**
 * Records the user's answers to the blocking consent gate and to the account
 * notification settings. The database function self_service_record_consent
 * rechecks the actor, the allow-list and the value types, and appends the
 * user_consents audit rows in the same transaction - this route is the
 * authenticated, rate-limited front door, not the authority.
 *
 * Mirrors /api/self-service/profile: requireUser() for auth (so it inherits
 * getCurrentUser()'s timeout guard, C8) then the service client, because the
 * RPC is service_role-only by design (C14's self-service exception pattern).
 */
const ALLOWED_KEYS = new Set<string>([
  "source",
  "version",
  ...CONSENT_KINDS,
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  if (!(await checkRateLimit(`consent:user:${user.id}`, 30, 60 * 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const values = await request.json().catch(() => null);
  if (!isObject(values) || Object.keys(values).length === 0) {
    return Response.json({ error: "invalid_consent_payload" }, { status: 400 });
  }
  // A user may only stamp the two UI sources on their own writes;
  // 'email_unsubscribe' belongs to the Resend webhook (C33).
  if (
    values.source !== undefined &&
    values.source !== "registration_gate" &&
    values.source !== "account_settings"
  ) {
    return Response.json({ error: "invalid_consent_source" }, { status: 400 });
  }
  for (const key of Object.keys(values)) {
    if (!ALLOWED_KEYS.has(key)) {
      return Response.json(
        { error: "consent_field_not_allowed" },
        { status: 400 },
      );
    }
  }

  const db = createServiceClient(user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("self_service_record_consent", {
    p_actor_id: user.id,
    p_values: values,
  });
  if (error) {
    return Response.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 400 },
    );
  }
  return Response.json(data);
}
