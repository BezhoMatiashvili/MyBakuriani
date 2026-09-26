# Security hardening — PROGRESS CHECKPOINT (rewrite before every compaction / wave boundary)

Goal + verbatim prompt + user decisions: `00-goal-prompt.md` (same folder). Plan:
`~/.claude/plans/adaptive-stirring-feather.md`. Session id: `s-sec-harden-0926`.

Last updated: 2026-09-26 ~14:30Z (S0 PASS on staging; Phase 1 discovery workflow running; S0 commit ask pending)

## Overall idea (one paragraph)

Loop per vulnerability: find → capture BEFORE (screenshots ×2 for a noise mask + behaviour/exploit
fingerprint) → fix (+ regression test, adversarial review; DB fixes dry-run in BEGIN…ROLLBACK first)
→ capture AFTER → PASS only if it looks the same, legit flows act the same, exploit blocked. App +
edge + DB-authz security first (waves S0–S3), then Supabase production readiness (performance,
integrity, ops, drift, scale), then a prod rollout runbook. Everything lands on STAGING; PROD is
untouched this session (user decision).

## Phase status

| Phase                    | State       | Notes                                                          |
| ------------------------ | ----------- | -------------------------------------------------------------- |
| 0 Setup | done | docs, memory, settings env (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60), coordination, base build :3140 |
| S0 (D1+D3) | PASS on staging; commit ask pending | migrations 20260926170000 + 170100, check-db-contracts C34, types +1 line, contracts C34 appended |
| 1 Security discovery (running) | workflow `sec-find` wf_8a583105-0ff launched ~14:20Z | 8 finders + merge, read-only |
| 1 Security discovery     | pending     | workflows `sec-find` (9 agents) + `sec-verify`                 |
| 2 Security waves S1–S3   | pending     |                                                                |
| 3 DB readiness discovery | pending     | workflows `db-find` + `db-verify`                              |
| 4 DB readiness waves     | pending     |                                                                |
| 5 Prod runbook           | pending     | `02-prod-runbook.md`                                           |
| 6 Final verification     | pending     | paired HEAD-vs-tree e2e, visual sweep, advisors                |

## Finding ledger

Status: `seed` (from exploration, not yet re-verified) → `confirmed` → `fixing` → `PASS` / `FAIL` /
`wontfix` (with reason). Evidence root: `~/.cache/mb-sec-0926/<ID>/{before,after}/`.

| ID             | Layer   | Sev          | Finding (short)                                                                                                                                                                      | UI surface                                              | Before | Fix | After | Verdict | Status                    |
| -------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------ | --- | ----- | ------- | ------------------------- |
| D1 | DB | CRIT | anon/authenticated INSERT/UPDATE/DELETE on auto-updatable `public_organizations` + `public_listing_profiles` (owner postgres, BYPASSRLS) — confirmed on PROD + staging | landing, /sales, /hotels, company, lister, detail pages | S0/before: anon DELETE/PATCH 204 on both views; reads 39/34/1/6/1/19; screenshots before1+before2 (noise: 7/44 shots, text identical) | `20260926170000` REVOKE writes on 6 views (dry-run proven) | S0/after: 401 42501; reads identical; check:db-contracts 0 fail | PASS — visual: 6/44 flagged, all explained (sales '19→20 სთ წინ' relative time; landing/apartments image-decode noise); status/url/console identical | applied (staging) — PROD = runbook #1 |
| D3 | DB | HIGH latent | `pg_default_acl` (postgres + supabase_admin) grants anon/authenticated EXECUTE + ALL on new objects | all RPC-backed pages | dry-run: new fn/table/view got anon+auth privileges | same migration: ALTER DEFAULT PRIVILEGES (schema public anon/auth + role-wide PUBLIC EXECUTE) + `security_posture_snapshot()` (170100) + C34 contract + check-db-contracts C34 block | new objects get nothing for anon/auth/PUBLIC; service_role kept; existing grants unchanged | PASS | applied (staging) |
| D2             | DB      | HIGH         | forgeable `bookings` INSERT/UPDATE (calendar block, review unlock, SMS drain)                                                                                                        | renter calendar, reviews, guest bookings                |        |     |       |         | seed                      |
| D4             | DB      | MED-HIGH     | table-wide UPDATE on `profiles` (rating, phone, personal_id, consent cols)                                                                                                           | profile/settings/account, consent gate                  |        |     |       |         | seed                      |
| D5             | DB      | MED          | owner-writable trust columns (`is_b2b_partner`, rating, counts, `created_at`)                                                                                                        | create/edit forms, /hotels badges, search order         |        |     |       |         | seed                      |
| D6             | Storage | LOW-MED      | `property-photos` direct INSERT bypasses quarantine; UPDATE no folder check                                                                                                          | photo uploaders                                         |        |     |       |         | seed                      |
| D7             | DB      | LOW-MED      | manual-booking RPCs lock `sms_dispatch_claim` before ownership check                                                                                                                 | renter calendar                                         |        |     |       |         | seed                      |
| D8             | Edge    | LOW-MED      | edge rate limit keys first XFF hop; `search` lat/lng full scan                                                                                                                       | search, VIP purchase                                    |        |     |       |         | seed                      |
| D9             | DB      | LOW          | range cap, membership spam, NULL `<>`, `settle_payment`/sandbox leftovers, secret reuse, promocodes listable, no purchase idempotency                                                | calendar, org membership, purchase modals               |        |     |       |         | seed                      |
| D10            | Auth    | INFO         | leaked-password protection off                                                                                                                                                       | register / reset password                               |        |     |       |         | seed                      |
| A1             | App     | MED          | `/_next/image` + CSP accept any `*.supabase.co` project, any quality                                                                                                                 | every image                                             |        |     |       |         | seed                      |
| A2             | App     | MED          | `/api/og/listing/*` no rate limit, query-string cache bypass                                                                                                                         | share menu, og:image                                    |        |     |       |         | seed                      |
| A3             | App     | MED          | site-lock password in public repo history; unlock cookie never Secure; `===` compare                                                                                                 | /site-locked unlock                                     |        |     |       |         | seed (rotation → runbook) |
| A4             | App     | MED residual | `unsafe-inline` CSP + JS-readable auth cookies (nonce CSP conflicts with ISR/C28)                                                                                                    | all pages                                               |        |     |       |         | seed (document residual)  |
| A5             | App     | LOW-MED      | ~20 user routes return raw DB/provider errors                                                                                                                                        | food orders, SMS center, consent, …                     |        |     |       |         | seed                      |
| A6             | App     | LOW-MED      | content-change-requests: no rate limit, unbounded JSON, co-member overwrite                                                                                                          | dashboard edit forms                                    |        |     |       |         | seed                      |
| A7–A9, A12–A14 | App     | LOW          | unvalidated stored URLs; price-drop cap race; existence-before-authz; UUID checks; dotted-path skip; stale MFA spec; missing tests; brand-SMS owner text; counters; geocode UA email | various                                                 |        |     |       |         | seed                      |
| A10            | App     | verify       | Next rate-limit key may be a shared Cloudflare IP                                                                                                                                    | contact reveal, job apply, unlock                       |        |     |       |         | seed (measure first)      |
| A11            | Auth    | verify       | hosted auth settings (email confirm, secure_password_change, CAPTCHA, rate limits)                                                                                                   | login/register/reset                                    |        |     |       |         | seed                      |
| R1–R7          | DB ops  | —            | prod CPU-starved, cron history unbounded, permissive policies + FK indexes, NOT VALID check, background load, prod-config check gaps, ops risks                                      | dashboards, all                                         |        |     |       |         | seed (Phase 3)            |

## Environment / infra state

- Baseline build: `~/.cache/mb-sec-base` (exact HEAD 915f3f8 via `git archive`, NEXT_PUBLIC_SITE_URL/ALLOWED_ORIGINS=:3140) → RUNNING on `:3140` (nohup next start).
- Tools: `~/.cache/mb-sec-0926/tools/capture.mjs` (22 public routes × d1440/m390, blocks non-GET /api), `compare.mjs` (pixel diff minus noise mask + fingerprint), `routes-public.json` (real staging ids); probes in `probes/` (S0-views.mjs).
- Lesson: the Prettier PostToolUse hook rewraps whole files on Edit — for repo files that are not prettier-clean (check-db-contracts.mjs, docs/contracts.md) edit via a python script, then confirm `git diff` is additive only.
- After build: `~/.cache/mb-sec-after` → `:3141` — not yet built.
- tnlu.service: running on :3000 (stop only for edge-flow checks, then start).
- Staging advisors BEFORE (2026-09-26 13:11Z): security = 17 rls_enabled_no_policy (INFO),
  6 security_definer_view (ERROR), 1 function_search_path_mutable, 1 anon definer exec
  (`is_admin_user`), 21 authenticated definer exec, leaked-password protection off.
  Performance (agent C): 42 multiple_permissive_policies, 39 unindexed FKs, 74 unused indexes.

## Workflows run (scriptPath / runId for resume within the same session)

- (none yet — S0 was catalog-proven, no workflow needed)

## Open questions / waiting on user

- S0 commit (files: 2 migrations, scripts/check-db-contracts.mjs +24, database.generated.ts +1, ONLY the C34 hunk of docs/contracts.md via generated patch)
- (none else right now) — prod rotation of the site-lock password and all prod items → runbook.

## Resume-from-here steps

1. Read `00-goal-prompt.md`, then this file, then the plan.
2. `git status` + `coordination/sessions/*` + `messages.md` tail (other sessions may have moved).
3. Continue at the first phase whose state is not `done`.
