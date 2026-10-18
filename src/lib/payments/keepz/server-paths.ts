/**
 * The two Keepz routes that are called server to server, so their POSTs carry
 * no browser Origin header:
 *   - the payment callback, POSTed by Keepz;
 *   - the reconcile sweeper, POSTed by pg_cron with a shared secret.
 *
 * src/middleware.ts exempts exactly these paths (no prefix match, no trailing
 * slash) from the cookie-mutation Origin check. Neither route reads cookies:
 * the callback trusts nothing it is sent, and the sweeper requires its Bearer
 * secret. scripts/check-contracts.mjs verifies both route files exist and the
 * middleware uses this list. Keepz registers the callback URL byte-for-byte
 * per environment (C32).
 */
export const KEEPZ_CALLBACK_PATH = "/api/payments/keepz/callback";
export const KEEPZ_RECONCILE_PATH = "/api/payments/keepz/reconcile";

export const KEEPZ_ORIGINLESS_POST_PATHS: readonly string[] = [
  KEEPZ_CALLBACK_PATH,
  KEEPZ_RECONCILE_PATH,
];
