# Code graph (graphify)

[graphify](https://github.com/Graphify-Labs/graphify) reads the TypeScript, Deno and SQL migrations in this repo and builds a graph of who calls, imports and references what. It runs locally, and the commands below make no LLM calls. The output goes to `graphify-out/`, which is git-ignored, so every checkout builds its own.

Use it for questions like "who calls `getClientIp`?" or "what does changing this function touch?". Before editing anything, still read `docs/contracts.md` and grep the symbol repo-wide (see Limits).

## Install (once per machine)

Install it with [uv](https://docs.astral.sh/uv/). The `sql` extra parses `supabase/migrations/*.sql` into nodes such as `public.apply_pii_retention()`:

```bash
uv tool install "graphifyy[sql,leiden]"   # the PyPI package name has two y's
graphify --version
```

## Build the graph (each checkout or worktree)

```bash
GRAPHIFY_BACKEND=none graphify extract . --code-only
GRAPHIFY_BACKEND=none graphify cluster-only . --no-label
```

A first build takes about 30 s; later ones are incremental. `GRAPHIFY_BACKEND=none` turns off LLM naming of communities, which would otherwise send code to an external model. `--code-only` skips the docs, PDFs and images. `.graphifyignore` lists the folders the build skips.

After you change code, refresh the graph:

```bash
GRAPHIFY_BACKEND=none graphify update .
```

## Use it

Run every command from inside the checkout you are working on (`cd <worktree> && graphify …`). Each reads `./graphify-out/graph.json`, so a graph built in another folder describes that folder's branch, not yours.

| Question                                    | Command                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| What is X, who calls it, what does it call? | `graphify explain "src/lib/client-ip.ts::getClientIp()"`                      |
| What breaks if I change X?                  | `graphify affected "src/lib/client-ip.ts::getClientIp()"`                     |
| How are A and B connected?                  | `graphify path "<A>" "<B>"`                                                   |
| Overview of the codebase                    | open `graphify-out/GRAPH_REPORT.md` or `graphify-out/graph.html` in a browser |

When a name exists more than once (for example `checkRateLimit` in `src/lib/rateLimit.ts` and in `supabase/functions/_shared/guards.ts`), the CLI lists the candidates. Retry with the `path::symbol` form it suggests.

Plain-language `graphify query "<question>"` matches keywords and returns noisy results, so prefer `explain` and `affected`.

## Limits

- **String couplings are invisible to it.** It cannot see i18n keys, `supabase.functions.invoke("<name>")`, RPC names, CHECK values, storage bucket ids and the other couplings in `docs/contracts.md`, because a string connects them, not a call or an import. These are the most dangerous edits in this repo, and `scripts/check-contracts.mjs` and a repo-wide grep remain the guard.
- **It shows the files on disk.** A stale checkout gives stale answers. Rebuild before you trust it.

## Optional: rebuild on every commit

`graphify hook install` adds git hooks (post-commit, post-checkout, post-merge, post-rewrite) that rebuild in the background and log to `~/.cache/graphify-rebuild.log`. The hooks skip linked worktrees. The command also appends `graphify-out/graph.json merge=graphify` to `.gitattributes`. Undo that line, because `graph.json` is never committed.

## Do not

- Commit `graphify-out/`.
- Run `graphify claude install`. It appends generic rules to `CLAUDE.md` ("query the graph before any grep"), which contradict the contracts grep, and adds hooks to the shared `.claude/settings.json` that fail on machines without graphify. The project's own rules are in the `CLAUDE.md` section "Code graph (graphify)".
- Run a build without `GRAPHIFY_BACKEND=none` unless you are fine with code going to an LLM provider.

To remove graphify: `graphify hook uninstall` (if the hooks are installed), then `uv tool uninstall graphifyy`.
