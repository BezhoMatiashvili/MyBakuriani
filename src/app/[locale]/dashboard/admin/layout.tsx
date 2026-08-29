import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";
import { isAal2Verified } from "@/lib/auth/mfa-assurance";
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
  if (!(await isAal2Verified(supabase.auth))) {
    redirect(`/auth/mfa?next=${encodeURIComponent(next)}`);
  }

  return <>{children}</>;
}
