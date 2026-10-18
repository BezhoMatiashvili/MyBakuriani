/**
 * The ownership-verification route that is called server to server, so its
 * POST carries no browser Origin header (C39):
 *   - the document purge, POSTed hourly by pg_cron with a shared secret
 *     (job ownership-document-purge-hourly).
 *
 * src/middleware.ts exempts exactly this path (no prefix match, no trailing
 * slash) from the cookie-mutation Origin check. The route reads no cookies:
 * it requires its Bearer secret. scripts/check-contracts.mjs verifies the
 * route file exists and the middleware uses this list.
 */
export const OWNERSHIP_PURGE_PATH = "/api/ownership-verifications/purge";

export const OWNERSHIP_ORIGINLESS_POST_PATHS: readonly string[] = [
  OWNERSHIP_PURGE_PATH,
];
