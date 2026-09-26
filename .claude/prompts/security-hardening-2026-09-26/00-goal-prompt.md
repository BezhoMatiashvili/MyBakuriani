# Security hardening + production readiness — GOAL PROMPT (read this first)

Started 2026-09-26 by session `s-sec-harden-0926`. Companion docs in this folder:
`01-progress.md` (living checkpoint — resume from there), `02-prod-runbook.md` (Phase 5 output).
Approved plan: `~/.claude/plans/adaptive-stirring-feather.md`.

## The user's prompt (verbatim)

> ultrathink and ultracode, I want you to do a security hardenining , Create a loop where you will
> identify security vunelebility then check current behavior and UI of website on elements related to
> that vunelebility , once checked note how it behaves and looks then make a security fix and
> hardening , once fixed check again and make sure that it looks same and acts same. Finally go on db
> supabse side and identify all current or future issues that might cause some problems when we go to
> productions , do same loop and fix those issues, after this session we should be ready for
> production , To really achive this i want you to spawn agents that will dive deeply into this and
> also you to be an orchestrator that will lead this process. To make sure we dont encouter long
> session issues i want you to compact everytime you reach 60% of session length. To make sure new
> session goes perfectly create a sub-document where you will store this prompt , aslo create new
> document that you will modify beffore compact and store previous sessions progress and overall idea
> and prompt.

## Interpretation (what "done" means)

1. **Security loop (app + edge + DB authz):** for every vulnerability — find it → capture how the
   related UI looks and behaves today (screenshots + behaviour fingerprint + live exploit repro) →
   fix/harden → re-capture → it must look the same, act the same for legit flows, and the exploit
   must be blocked.
2. **DB production-readiness loop (Supabase):** same loop for current/future production problems
   (performance, integrity, ops, drift, scale).
3. **Orchestration:** the main session orchestrates, applies and judges; subagents/workflows do the
   deep dives (discovery, adversarial verification, fixes, reviews).
4. **Continuity:** this doc = the prompt; `01-progress.md` = the checkpoint rewritten before any
   compaction and at every wave boundary. Auto-compact at 60 % via
   `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` in `.claude/settings.local.json` (effective from the next
   session start); otherwise checkpoint + suggest `/compact` at wave boundaries.

## User decisions (append-only)

- 2026-09-26: End state = **staging-verified + prod rollout runbook**. PROD DB/app/edge untouched.
- 2026-09-26: **Staging changes without asking** (migrations, edge-function redeploys, staging auth
  settings).
- 2026-09-26: May `systemctl --user stop tnlu.service` to free :3000 for edge-flow checks; start it
  again right after.
- 2026-09-26: **Commits: one per verified wave on `staging`, ask each time** (a push deploys staging).
- 2026-09-26: Critical D1 (anon-writable `public_*` views) hotfix → **staging only**; prod gets it as
  runbook item #1. Do not re-ask.

## Ground rules (from CLAUDE.md, memory and the plan)

- Coordination protocol (`coordination/README.md`): session file `s-sec-harden-0926`, claim before
  editing, never touch other sessions' uncommitted hunks. `docs/contracts.md` carries ANOTHER
  session's uncommitted condensation — full contract detail lives in `git show HEAD:docs/contracts.md`.
- `mcp__supabase__*` = PROD (`yuwyrmxccrpfjvidwhhg`) → read-only at most. `mcp__supabase-staging__*` =
  STAGING (`laxwtegxpemuuyxluqsi`). Every agent prompt that can touch a DB says "never call
  `mcp__supabase__*`".
- DB fixes: generate from live `pg_get_functiondef`, dry-run in `BEGIN … ROLLBACK` with role
  simulation (legit writes succeed, exploit fails), then `apply_migration` on staging, verify.
- Probes are non-destructive: staging ref asserted, prod ref refused, write probes filtered by a
  random uuid or e2e fixture rows only.
- Builds only in `~/.cache/mb-sec-*` copies (never the shared `.next`); `build && start`, not `dev`;
  edge-function flows only on :3000.
- No commit/push without asking. Surgical fixes + a regression test each. Contracts + C29 check
  scripts updated in the same session.
