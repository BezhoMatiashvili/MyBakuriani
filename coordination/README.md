# Multi-session coordination

Local scratch protocol for when more than one Claude session works this repo at
once. **This file is committed; the live state is not** — `sessions/`, `locks/`,
and `messages.md` are git-ignored (see `.gitignore`: `/coordination/*` +
`!/coordination/README.md`). Everything here is append/local-only; no session edits
another session's session file.

## Core rule

**Uncommitted changes you did not make are NOT yours.** If `git status` shows edits
you didn't write, another session is mid-task. Do **not** revert, stash, commit, or
"clean them up." Check `sessions/` and `locks/` to see who owns them; if unclear,
leave them and ask the user.

## When you start a session

1. Pick a short id: `s-<something-memorable>` (e.g. `s-i18n-fix`).
2. Create `sessions/<id>.md` from the template below.
3. Read every other `sessions/*.md` and all `locks/*` to see what's claimed.

## Before you edit files

1. Append the paths you're about to touch to your session file's **Claimed files**.
2. For a file/area you need **exclusively** (risky refactor, migration, generated
   file), create a lock: `locks/<url-encoded-path>.lock` containing your session id
   - one line of intent. One writer per lock.
3. Check no other session already claims those paths (grep `sessions/` + `locks/`).
   If there's a conflict, coordinate via `messages.md` before proceeding.

Claim at the granularity that avoids collisions: a single file, or a whole area
(e.g. `src/i18n/**`). High-contention shared files worth locking before editing:
`src/lib/types/database.ts` (generated — **C3**), `messages/*.json` (**C1**),
`next.config.ts` (**C6**), `src/i18n/namespaces.ts` (**C1**), `CLAUDE.md`,
`memory-bank/**`.

## Messaging

`messages.md` is an **append-only** cross-session log. Append with a shell
redirect only — never open it in an editor and rewrite it (that races):

```bash
printf '\n- [%s] s-my-id: releasing src/i18n/**, namespaces.ts updated\n' \
  "$(date -u +%FT%TZ)" >> coordination/messages.md
```

## When you finish

1. Remove your `locks/*` entries.
2. Mark your `sessions/<id>.md` **Status: done** (or delete it).
3. Append a one-line handoff to `messages.md` if work spans sessions.

## Session file template

```markdown
# Session <id>

Status: active | done
Started: <UTC timestamp>
Working on: <one line — what this session is doing>

## Claimed files

- path/one
- path/two

## Notes

- anything the next session needs to know
```
