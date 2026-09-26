import "server-only";

/**
 * Email env (C33). Every value is optional so an unconfigured deployment
 * simply sends nothing; none of them belongs in check-production-config.mjs
 * (C16's "unconfigured must never break the build" rule).
 *
 *   EMAIL_DELIVERY_ENABLED     "true" or nothing is sent (fail closed)
 *   EMAIL_ALLOWED_RECIPIENTS   REQUIRED: a comma list of the only addresses
 *                              that may get mail (everything else is
 *                              cancelled), or "*" for everyone. Unset = nothing
 *                              is sent, so a staging DB restored from prod can
 *                              never mail real users by accident.
 *   EMAIL_DAILY_CAP            notification emails per UTC day (default 80),
 *                              leaving headroom in Resend's free 100/day for
 *                              Supabase Auth mail (signup, password reset)
 *   RESEND_API_KEY             FULL-ACCESS key: sends notifications and
 *                              manages marketing contacts (Broadcasts)
 *   EMAIL_FROM                 default "MyBakuriani <no-reply@mybakuriani.ge>"
 *   EMAIL_REPLY_TO             optional
 *   EMAIL_DISPATCH_SECRET_SHA256   hash of the pg_cron Bearer (secret in Vault)
 *   RESEND_WEBHOOK_SECRET      "whsec_…" from the Resend webhook
 */
export type EmailConfig = {
  deliveryEnabled: boolean;
  /** "all" only when explicitly EMAIL_ALLOWED_RECIPIENTS="*". */
  allowedRecipients: Set<string> | "all";
  dailyCap: number;
  resendApiKey: string | null;
  from: string;
  replyTo: string | null;
  siteUrl: string | null;
};

export function getEmailConfig(): EmailConfig {
  const allowed = (process.env.EMAIL_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const capRaw = process.env.EMAIL_DAILY_CAP?.trim();
  const cap = capRaw ? Number(capRaw) : 80;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return {
    deliveryEnabled: process.env.EMAIL_DELIVERY_ENABLED === "true",
    allowedRecipients:
      allowed.length === 1 && allowed[0] === "*" ? "all" : new Set(allowed),
    dailyCap: Number.isInteger(cap) && cap >= 0 ? cap : 80,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
    from:
      process.env.EMAIL_FROM?.trim() || "MyBakuriani <no-reply@mybakuriani.ge>",
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
    siteUrl: /^https?:\/\//.test(site) ? site : null,
  };
}
