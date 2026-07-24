import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { safeInternalPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

const ORIGINAL_REQUEST_PATH_HEADER = "x-mybakuriani-request-path";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const next =
    safeInternalPath(requestHeaders.get(ORIGINAL_REQUEST_PATH_HEADER)) ??
    "/dashboard/admin";
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const profile = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") {
    redirect(`/auth/mfa?next=${encodeURIComponent(next)}`);
  }

  return <>{children}</>;
}
