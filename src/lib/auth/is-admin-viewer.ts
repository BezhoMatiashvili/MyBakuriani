import { getCurrentProfile } from "@/lib/auth/current-user";

/**
 * Returns true if the current request is from a signed-in admin.
 * Used by public data helpers (get*ById) to bypass the status='active'
 * filter so admins can preview pending listings before approving them.
 *
 * Backed by the request-memoized getCurrentProfile(), so repeated admin checks
 * within one render share a single auth round-trip.
 */
export async function isAdminViewer(): Promise<boolean> {
  try {
    const profile = await getCurrentProfile();
    return profile?.role === "admin";
  } catch {
    return false;
  }
}
