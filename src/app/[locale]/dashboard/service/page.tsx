import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadServiceData } from "./loadData";
import ServiceDashboardClient from "./ServiceDashboardClient";

export default async function ServiceDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadServiceData(supabase, user.id);

  return <ServiceDashboardClient userId={user.id} initial={initial} />;
}
