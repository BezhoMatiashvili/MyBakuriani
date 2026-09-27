import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { roleHomePath } from "@/lib/cabinets";

// Route to the role-specific dashboard on the server — no client mount,
// no extra "fetch role then redirect" round-trips, no loader flash.
// getCurrentProfile() is already memoized by the dashboard layout's call.
export default async function DashboardRedirect() {
  const [profile, locale] = await Promise.all([
    getCurrentProfile(),
    getLocale(),
  ]);

  if (!profile) {
    redirect({ href: "/auth/login", locale });
    return;
  }

  redirect({
    href: roleHomePath(profile.role),
    locale,
  });
}
