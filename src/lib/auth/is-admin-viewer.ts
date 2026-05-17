import { createClient } from "@/lib/supabase/server";

/**
 * Returns true if the current request is from a signed-in admin.
 * Used by public data helpers (get*ById) to bypass the status='active'
 * filter so admins can preview pending listings before approving them.
 */
export async function isAdminViewer(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return profile?.role === "admin";
  } catch {
    return false;
  }
}
