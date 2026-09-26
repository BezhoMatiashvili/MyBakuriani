// The ONE authority for "may we send this user a marketing message on channel X".
// Kept free of runtime "@/" imports so scripts/unit/consent.test.mjs can import
// it straight from src/ (see C29).
//
// DELIVERY REALITY, so nobody mistakes intent for wiring:
//   sms   - genuinely enforced today. profiles.marketing_opt_out is a trigger-
//           derived mirror of marketing_sms_consent, and the SMS pipeline
//           (sms-automation-run's reachable(), sms_cancel_ineligible_automation,
//           the price-drop joins) already reads that mirror.
//   email - enforced since C33: only users with marketing_email_consent = true
//           are subscribed Resend contacts (email_marketing_sync), and a
//           Broadcast unsubscribe writes the withdrawal back here.
//   whatsapp - NO WhatsApp marketing sender exists anywhere in this project.
//              (Unrelated to profiles.whatsapp_enabled, a contact-display flag.)
//   push  - NO web-push infrastructure exists anywhere in this project.
// The last three are persisted and gated here so that whoever builds a sender
// calls this function instead of inventing a second definition of consent.

/**
 * The consent kinds and sources, in one place. These strings are a FOUR-way
 * coupling with no compiler link between the sides:
 *   1. this union,
 *   2. the CHECK constraints on public.user_consents (kind, source),
 *   3. self_service_record_consent's v_allowed array,
 *   4. the ALLOWED_KEYS gate in src/app/api/consent/route.ts.
 * scripts/check-db-contracts.mjs compares 1 against 2 (contract C30).
 */
export const CONSENT_KINDS = [
  "terms",
  "privacy",
  "marketing_sms",
  "marketing_email",
  "marketing_whatsapp",
  "push",
] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const CONSENT_SOURCES = [
  "registration_gate",
  "account_settings",
  // Written only by /api/email/resend-webhook (C33); /api/consent refuses it.
  "email_unsubscribe",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Revision stamped onto terms/privacy acceptance (profiles.terms_version /
 * privacy_version and their user_consents.version). Tracks the `lastUpdated`
 * of terms.*.ts and privacy.*.ts in src/content/legal/ - both 09.09.2026.
 * Bumping this is what lets a future policy change re-prompt users without a
 * schema change; nothing re-prompts automatically today.
 */
export const CONSENT_POLICY_VERSION = "2026-09-09";

/**
 * Revision stamped onto marketing-channel consent rows. Tracks the
 * `lastUpdated` of marketing.*.ts (Direct Marketing Policy v2, 23.09.2026),
 * which section 6.2 requires be recorded with each consent. Kept separate from
 * CONSENT_POLICY_VERSION so a marketing-policy revision never mislabels which
 * Terms/Privacy text a user accepted.
 */
export const MARKETING_POLICY_VERSION = "2026-09-23";

export type MarketingChannel = "sms" | "email" | "whatsapp" | "push";

/** Only the channels whose senders actually exist today. */
export const LIVE_MARKETING_CHANNELS: readonly MarketingChannel[] = [
  "sms",
  "email",
];

export type ConsentFields = {
  marketing_sms_consent?: boolean | null;
  marketing_email_consent?: boolean | null;
  marketing_whatsapp_consent?: boolean | null;
  push_consent?: boolean | null;
};

export type RequiredConsentFields = {
  terms_accepted_at?: string | null;
  privacy_accepted_at?: string | null;
};

const FIELD_BY_CHANNEL: Record<MarketingChannel, keyof ConsentFields> = {
  sms: "marketing_sms_consent",
  email: "marketing_email_consent",
  whatsapp: "marketing_whatsapp_consent",
  push: "push_consent",
};

/**
 * Affirmative opt-in: ONLY an explicit `true` allows a marketing send.
 * `null` (never answered) and `false` (declined) both deny, which is the whole
 * point of the tri-state - `marketing_opt_out` could not express "unanswered".
 */
export function marketingChannelAllowed(
  profile: ConsentFields | null | undefined,
  channel: MarketingChannel,
): boolean {
  if (!profile) return false;
  return profile[FIELD_BY_CHANNEL[channel]] === true;
}

/**
 * Transactional / service messages are NOT gated by any of this. Per the Direct
 * Marketing Policy (v2) section 9, withdrawing marketing consent must not switch off
 * the messages required to operate the account, and _enqueue_system_sms
 * correspondingly consults no preference. Exported as a function so the intent
 * is explicit at call sites rather than an unexplained missing check.
 */
export function serviceMessageAllowed(): boolean {
  return true;
}

/**
 * Has the user answered the blocking consent gate? Both terms AND privacy are
 * required; marketing is optional and deliberately not part of this predicate.
 */
export function hasAcceptedRequiredPolicies(
  profile: RequiredConsentFields | null | undefined,
): boolean {
  return Boolean(profile?.terms_accepted_at && profile?.privacy_accepted_at);
}
