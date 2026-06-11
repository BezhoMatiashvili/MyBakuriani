import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadGuestData } from "./loadData";
import GuestDashboardClient from "./GuestDashboardClient";

export default async function GuestDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadGuestData(supabase, user.id);

  return <GuestDashboardClient userId={user.id} initial={initial} />;
}
