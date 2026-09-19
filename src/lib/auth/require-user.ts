import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Verifies the request comes from an authenticated user.
 * Returns the user on success, or a Response to return immediately on failure.
 *
 * Mirrors requireAdmin()'s calling convention (`const guard = await
 * requireUser(); if (!guard.ok) return guard.response;`) but is backed by
 * getCurrentUser() instead of a raw `auth.getUser()` call, so it inherits its
 * timeout guard against Supabase Auth's round-trip hanging past the ~10s
 * serverless execution budget (see current-user.ts). Unlike AdminSession,
 * this returns the full getCurrentUser() result rather than a trimmed
 * {userId, email} shape, since callers already depend on `user.id` in place.
 */
export async function requireUser(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: Response }
> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  return { ok: true, user };
}
