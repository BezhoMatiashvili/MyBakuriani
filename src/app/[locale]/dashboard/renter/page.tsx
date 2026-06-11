import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadRenterOverview } from "./loadOverview";
import RenterDashboardClient from "./RenterDashboardClient";

export default async function RenterDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadRenterOverview(supabase, user.id);

  return <RenterDashboardClient userId={user.id} initial={initial} />;
}
