import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/current-user";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard/admin");
  }

  const profile = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
