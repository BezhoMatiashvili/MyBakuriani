import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/current-user";
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
    // Signed in but no profile row: /auth/register was never finished, and the
    // login page does not forward a signed-in user. The wizard also covers a
    // failed profile read (it finds the profile and moves on), and its own
    // fallback is /dashboard/guest, so this cannot loop.
    const user = await getCurrentUser();
    redirect({ href: user ? "/auth/register" : "/auth/login", locale });
    return;
  }

  redirect({
    href: roleHomePath(profile.role),
    locale,
  });
}
