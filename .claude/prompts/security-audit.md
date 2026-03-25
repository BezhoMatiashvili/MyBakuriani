Perform a comprehensive security audit of the entire codebase. Identify every existing vulnerability and potential future security risk. Do NOT fix anything — this is audit-only. Document everything in SECURITY_AUDIT.md.

Check ALL of the following areas systematically:

AUTHENTICATION: session handling, token refresh, JWT validation, auth tokens in URLs, server-side route protection, missing auth middleware on API routes, anon key vs service_role key usage, role enforcement server-side, privilege escalation vectors, self-role-modification.

ROW LEVEL SECURITY: list all tables, check RLS enabled/disabled, review every policy scope, check for overly permissive policies (SELECT true, WITH CHECK true), verify service_role key never in client code, check webhook endpoints use correct keys, check missing RLS on sensitive tables, test cross-user data access paths.

API SECURITY: input validation (zod/joi or raw), SQL injection vectors, rate limiting gaps, CORS configuration, CSRF protection, error response information leakage (stack traces, DB details, error.message), over-fetching data, file upload validation.

PAYMENT SECURITY: private key exposure, callback signature/encryption verification, payment amount manipulation, replay attacks, server-side price validation, payment status forgery.

ENVIRONMENT AND SECRETS: .env in .gitignore, git history for leaked secrets, NEXT_PUBLIC_ variable exposure, service_role key isolation, hardcoded credentials, env var documentation.

CLIENT-SIDE: XSS (dangerouslySetInnerHTML, unescaped content), open redirects from user input, CSP headers, localStorage sensitive data, source maps in production, clickjacking protection.

DATA EXPOSURE: SELECT * usage, unauthorized PII access, content access without authorization, password reset flow security, user enumeration, predictable file/media URLs.

INFRASTRUCTURE: next.config.js security headers, cookie flags (httpOnly, secure, SameSite), npm audit vulnerabilities, outdated packages with CVEs, debug endpoints in production, error handling in production.

BUSINESS LOGIC: authorization bypass without payment, referral/reward system abuse, access expiry enforcement server-side, race conditions, admin action logging, user deletion cascading.

For each finding use this format:
## [SEVERITY: CRITICAL/HIGH/MEDIUM/LOW] — Title
**Location:** file path and line number
**Description:** what the vulnerability is
**Evidence:** code snippet proving it
**Impact:** what an attacker could do
**Recommendation:** how to fix it
**Priority:** P0 fix immediately / P1 fix this week / P2 fix this month / P3 backlog

Include at the top:
- Summary table of findings by severity
- Top 5 most urgent fixes
- Overall security posture rating (1-10)
- Estimated remediation effort by timeframe
- List of verified safe areas (things that ARE properly secured)

Do NOT fix any code. Document everything in SECURITY_AUDIT.md only.
