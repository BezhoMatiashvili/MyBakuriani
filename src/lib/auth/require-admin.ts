import { createClient } from "@/lib/supabase/server";

export type AdminSession = {
  userId: string;
  email: string | null;
};

/**
 * Verifies the request comes from an authenticated admin.
 * Returns the admin session on success, or a Response to return immediately on failure.
 */
export async function requireAdmin(): Promise<
  { ok: true; admin: AdminSession } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, admin: { userId: user.id, email: user.email ?? null } };
}
