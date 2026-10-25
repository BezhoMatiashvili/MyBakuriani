// Who may get an SMS (owner's technical task SMS-16, 2026-10-25; used by sms-dispatch and
// auth-send-sms). SMS_TEST_RECIPIENTS set = only those numbers. Unset = everyone, but only on
// the production project: anywhere else (staging, a branch) an unset list means nobody, so a
// forgotten secret can never text real guests from a test environment.
import { toUbillNumber } from "./ubill.ts";

// = src/lib/media-hosts.ts PROD_SUPABASE_HOST (check-contracts C18/recipients).
export const PROD_PROJECT_REF = "wlkmyxyaocvgqomrrbfs";

export type RecipientPolicy =
  { mode: "everyone" } | { mode: "listed"; numbers: Set<string> };

/** The project ref in https://<ref>.supabase.co, else null. */
export function projectRef(supabaseUrl: string | undefined): string | null {
  try {
    const host = new URL(supabaseUrl ?? "").hostname;
    return /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function recipientPolicy(
  testRecipients: string | undefined,
  supabaseUrl: string | undefined,
): RecipientPolicy {
  const raw = testRecipients?.trim();
  if (raw) {
    return {
      mode: "listed",
      numbers: new Set(
        raw
          .split(",")
          .map((n) => toUbillNumber(n))
          .filter((n): n is string => !!n),
      ),
    };
  }
  return projectRef(supabaseUrl) === PROD_PROJECT_REF
    ? { mode: "everyone" }
    : { mode: "listed", numbers: new Set() };
}

/** `number` in uBill's 9955XXXXXXXX form. */
export function recipientAllowed(
  policy: RecipientPolicy,
  number: string,
): boolean {
  return policy.mode === "everyone" || policy.numbers.has(number);
}
