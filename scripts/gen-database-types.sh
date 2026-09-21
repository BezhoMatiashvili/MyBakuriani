#!/usr/bin/env bash
# Regenerates src/lib/types/database.generated.ts from the live schema.
#
#   npm run types:gen            # rewrite the file
#   npm run types:gen -- --check # regenerate to a temp file and diff (CI)
#
# Requires the Supabase CLI to be logged in (`npx supabase login`) or
# SUPABASE_ACCESS_TOKEN in the environment. SUPABASE_PROJECT_ID selects the
# project; it defaults to the ref embedded in NEXT_PUBLIC_SUPABASE_URL so a
# checkout pointed at staging regenerates against staging.
#
# database.generated.ts is generator output only. Hand-written adjustments
# belong in src/lib/types/database.ts (contract C3).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a; source <(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_ACCESS_TOKEN|SUPABASE_PROJECT_ID)=' .env.local || true); set +a
fi

PROJECT_ID="${SUPABASE_PROJECT_ID:-}"
if [[ -z "$PROJECT_ID" && -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  PROJECT_ID="$(sed -E 's#https://([a-z0-9]+)\.supabase\.co.*#\1#' <<<"$NEXT_PUBLIC_SUPABASE_URL")"
fi
if [[ -z "$PROJECT_ID" ]]; then
  echo "gen-database-types: set SUPABASE_PROJECT_ID or NEXT_PUBLIC_SUPABASE_URL" >&2
  exit 2
fi

TARGET=src/lib/types/database.generated.ts
TMP="$(mktemp --suffix=.ts)"
trap 'rm -f "$TMP"' EXIT

{
  printf '// GENERATED FILE — do not edit by hand.\n'
  printf '// Source of truth: supabase/migrations/*.sql applied to the live project.\n'
  printf '// Regenerate: npm run types:gen   (see scripts/gen-database-types.sh)\n'
  printf '// Hand-written overrides live in ./database.ts, never here.\n\n'
  npx --yes supabase gen types typescript --project-id "$PROJECT_ID" --schema public
} >"$TMP"
npx prettier --log-level warn --write "$TMP" >/dev/null

if [[ "${1:-}" == "--check" ]]; then
  if diff -q "$TARGET" "$TMP" >/dev/null; then
    echo "✓ $TARGET matches the live schema of $PROJECT_ID"
  else
    echo "✗ $TARGET is stale against $PROJECT_ID — run: npm run types:gen" >&2
    diff -u "$TARGET" "$TMP" | head -80 >&2
    exit 1
  fi
else
  cp "$TMP" "$TARGET"
  echo "wrote $TARGET from $PROJECT_ID"
fi
