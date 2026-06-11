import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadSellerData } from "./loadData";
import SellerDashboardClient from "./SellerDashboardClient";

export default async function SellerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadSellerData(supabase, user.id);

  return <SellerDashboardClient userId={user.id} initial={initial} />;
}
