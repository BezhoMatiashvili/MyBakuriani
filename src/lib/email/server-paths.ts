/**
 * The email routes that are called server to server, so their POSTs carry no
 * browser Origin header (C33):
 *   - the dispatcher, POSTed by pg_cron with a shared secret;
 *   - the Resend webhook (Svix-signed).
 *
 * src/middleware.ts exempts exactly these paths (no prefix match, no trailing
 * slash) from the cookie-mutation Origin check. None of them reads cookies.
 * scripts/check-contracts.mjs verifies each route file exists and the
 * middleware uses this list.
 */
export const EMAIL_DISPATCH_PATH = "/api/email/dispatch";
export const EMAIL_RESEND_WEBHOOK_PATH = "/api/email/resend-webhook";

export const EMAIL_ORIGINLESS_POST_PATHS: readonly string[] = [
  EMAIL_DISPATCH_PATH,
  EMAIL_RESEND_WEBHOOK_PATH,
];
