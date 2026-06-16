import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadServiceData } from "../service/loadData";
import ServiceDashboardClient from "../service/ServiceDashboardClient";

export default async function TransportDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadServiceData(supabase, user.id, "transport");

  return (
    <ServiceDashboardClient
      userId={user.id}
      initial={initial}
      category="transport"
    />
  );
}
