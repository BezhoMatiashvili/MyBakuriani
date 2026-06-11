import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { loadCleanerTasks } from "./loadData";
import CleanerDashboardClient from "./CleanerDashboardClient";

export default async function CleanerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const initialTasks = await loadCleanerTasks(supabase, user.id);

  return (
    <CleanerDashboardClient userId={user.id} initialTasks={initialTasks} />
  );
}
