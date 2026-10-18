import type { NextRequest, NextResponse } from "next/server";

/**
 * Supabase's session cookie is `sb-<ref>-auth-token`, and `@supabase/ssr`
 * splits it into `.0` / `.1` / … chunks once the encoded session exceeds
 * MAX_CHUNK_SIZE (3180 bytes). Every consumer must therefore match by prefix,
 * never by exact name.
 */
function isAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

/**
 * Cookie *presence* only — no Supabase call, no parsing.
 *
 * Two callers, for two different reasons:
 *  - the ?preview=1 rewrite, which only needs "is this plausibly a signed-in
 *    browser" before handing off to RLS/admin checks;
 *  - `updateSession`, to tell "anonymous visitor" apart from "sent us auth
 *    cookies we could not turn into claims".
 */
export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => isAuthCookieName(cookie.name));
}

/** The auth cookies actually present, as `name → byte length`. Never values. */
export function describeAuthCookies(
  request: NextRequest,
): Record<string, number> {
  const seen: Record<string, number> = {};
  for (const cookie of request.cookies.getAll()) {
    if (isAuthCookieName(cookie.name)) seen[cookie.name] = cookie.value.length;
  }
  return seen;
}

/**
 * Expire every auth cookie the request carried.
 *
 * Used when the jar is present but unusable. Without this the browser keeps
 * re-sending the same unparseable cookie on every navigation while its own
 * in-memory session still looks healthy, so the tab shows a signed-in header
 * and every protected route bounces to the login card — permanently, because
 * nothing in the normal flow ever rewrites those chunks.
 *
 * Attributes must match how the cookie was written (path/sameSite/secure) or
 * the browser treats it as a different cookie and keeps the original.
 */
export function clearAuthCookies(
  request: NextRequest,
  response: NextResponse,
  secure: boolean,
): void {
  for (const cookie of request.cookies.getAll()) {
    if (!isAuthCookieName(cookie.name)) continue;
    response.cookies.set(cookie.name, "", {
      path: "/",
      sameSite: "lax",
      secure,
      maxAge: 0,
    });
  }
}

/**
 * Can the auth cookies the request carried actually be decoded into a session?
 *
 * Needed because a damaged jar fails in two different ways, and only one of
 * them is polite about it. Spliced-but-decodable bytes surface as
 * `getClaims() -> { data: null, error: null }`. Bytes that are not valid UTF-8
 * (an interleaved chunk boundary landing mid multi-byte sequence) instead make
 * `@supabase/ssr`'s storage adapter THROW `Invalid UTF-8 sequence` out of
 * getItem — which escapes the normal error channel entirely, lands in the
 * catch-all "never boot on a throw" branch, and leaves the user on an error
 * boundary with an unhandled rejection logged on every single navigation.
 *
 * Parsing the jar ourselves lets the caller tell "this session is unreadable,
 * clear it" apart from "something unrelated threw, let the request through",
 * without matching on an error message.
 */
export function isAuthJarParseable(request: NextRequest): boolean {
  const parts = new Map<string, string>();
  for (const cookie of request.cookies.getAll()) {
    if (isAuthCookieName(cookie.name)) parts.set(cookie.name, cookie.value);
  }
  if (parts.size === 0) return true; // nothing to parse is not "corrupt"

  const baseNames = new Set(
    [...parts.keys()].map((name) => name.replace(/\.\d+$/, "")),
  );

  for (const base of baseNames) {
    // @supabase/ssr stores the whole value under the base name, or splits it
    // across `.0`, `.1`, … chunks. Rebuild whichever form is present.
    let raw = parts.get(base);
    if (raw === undefined) {
      raw = "";
      for (let i = 0; parts.has(`${base}.${i}`); i++)
        raw += parts.get(`${base}.${i}`);
      if (raw === "") return false; // only non-contiguous chunks survived
    }

    try {
      let json = raw;
      if (raw.startsWith("base64-")) {
        const binary = atob(
          raw.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/"),
        );
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        // fatal:true is the point — this is what surfaces the bad sequence here
        // instead of deep inside the Supabase client.
        json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      }
      JSON.parse(json);
    } catch {
      return false;
    }
  }
  return true;
}
