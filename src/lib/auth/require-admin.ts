import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";

export type AdminSession = {
  userId: string;
  email: string | null;
};

/**
 * Verifies the request comes from an authenticated admin.
 * Returns the admin session on success, or a Response to return immediately on failure.
 *
 * Uses the request-memoized auth helpers so the user + role lookup is shared
 * with any other guard in the same render instead of re-fetched.
 */
export async function requireAdmin(): Promise<
  { ok: true; admin: AdminSession } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, admin: { userId: user.id, email: user.email ?? null } };
}
