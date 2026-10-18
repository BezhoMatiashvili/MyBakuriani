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
  const [initial, smartMatchRes] = await Promise.all([
    loadRenterOverview(supabase, user.id),
    supabase.rpc("smart_match_actionable_count"),
  ]);

  return (
    <RenterDashboardClient
      userId={user.id}
      initial={initial}
      initialSmartMatchCount={smartMatchRes.data ?? 0}
    />
  );
}
