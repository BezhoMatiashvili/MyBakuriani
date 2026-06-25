// Canonical UUID format check. Used to reject malformed ids (bare "1", stale
// slugs, crawler URLs) before they reach Postgres — a non-uuid value in a uuid
// column raises `invalid input syntax for type uuid` and wastes a DB connection.
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);
