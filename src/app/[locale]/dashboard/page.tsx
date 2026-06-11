import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";

const roleToDashboard: Record<string, string> = {
  guest: "/dashboard/guest",
  renter: "/dashboard/renter",
  seller: "/dashboard/seller",
  cleaner: "/dashboard/cleaner",
  food: "/dashboard/food",
  entertainment: "/dashboard/service",
  transport: "/dashboard/service",
  employment: "/dashboard/service",
  handyman: "/dashboard/service",
  admin: "/dashboard/admin",
};

// Route to the role-specific dashboard on the server — no client mount,
// no extra "fetch role then redirect" round-trips, no loader flash.
// getCurrentProfile() is already memoized by the dashboard layout's call.
export default async function DashboardRedirect() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login");
  }

  redirect(roleToDashboard[profile.role] ?? "/dashboard/guest");
}
