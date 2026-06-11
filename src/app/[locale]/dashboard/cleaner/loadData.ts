import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type TaskRow = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
  profiles: Pick<
    Tables<"profiles">,
    "display_name" | "phone" | "avatar_url"
  > | null;
};

/**
 * Loads the cleaner's open tasks. Shared by the server page (initial render,
 * server client) and the client realtime refetch (browser client) so the
 * query lives in one place and the first paint already has real data.
 */
export async function loadCleanerTasks(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TaskRow[]> {
  const { data } = await supabase
    .from("cleaning_tasks")
    .select(
      "*, properties(title, location), profiles!cleaning_tasks_owner_id_fkey(display_name, phone, avatar_url)",
    )
    .eq("cleaner_id", userId)
    .in("status", ["pending", "accepted", "in_progress"])
    .order("scheduled_at");
  return (data ?? []) as TaskRow[];
}
