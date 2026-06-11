import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadFoodData } from "./loadData";
import FoodDashboardClient from "./FoodDashboardClient";

export default async function FoodDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initial = await loadFoodData(supabase, user.id);

  return <FoodDashboardClient userId={user.id} initial={initial} />;
}
