// PostgREST's .or()/.ilike() filter strings are parsed for reserved syntax
// characters (`,`, `(`, `)`, `.`, `%`, `"`, `\`) — unescaped user input can alter
// the filter's structure instead of just being matched against. Strip them
// before interpolating free-text search input into a raw filter string.
export function sanitizeQuery(q: string): string {
  return q.replace(/[,()"\\%]/g, " ").trim();
}
