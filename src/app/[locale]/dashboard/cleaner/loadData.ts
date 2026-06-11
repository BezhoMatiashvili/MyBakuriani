import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type TaskRow = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
};

export type CleanerData = {
  myTasks: TaskRow[];
  available: TaskRow[];
};

/**
 * Loads the cleaner dashboard tasks. Shared by the server component (initial
 * render, server client) and the client realtime handler (browser client) so the
 * queries live in one place and the first paint already has real data.
 */
export async function loadCleanerData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CleanerData> {
  const [mineRes, poolRes] = await Promise.all([
    supabase
      .from("cleaning_tasks")
      .select("*, properties(title, location)")
      .eq("cleaner_id", userId)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("cleaning_tasks")
      .select("*, properties(title, location)")
      .is("cleaner_id", null)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(10),
  ]);

  return {
    myTasks: (mineRes.data ?? []) as TaskRow[],
    available: (poolRes.data ?? []) as TaskRow[],
  };
}
