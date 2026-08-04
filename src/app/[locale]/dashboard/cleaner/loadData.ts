import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  mergeCleanerTasks,
  type CleanerTaskItem,
  type ManualTaskRow,
  type PlatformTaskRow,
} from "@/lib/cleaner/tasks";

/**
 * Loads the cleaner's open platform and manual work. Shared by the server page
 * (initial render) and client realtime refetch so every overview render obeys
 * the two-source cleaner-work contract.
 */
export async function loadCleanerTasks(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CleanerTaskItem[]> {
  const [platform, manual] = await Promise.all([
    supabase
      .from("cleaning_tasks")
      .select(
        "*, properties(title, location), profiles!cleaning_tasks_owner_id_fkey(display_name, phone, avatar_url)",
      )
      .eq("cleaner_id", userId)
      .in("status", ["pending", "accepted", "in_progress"])
      .order("scheduled_at"),
    supabase
      .from("cleaner_manual_tasks")
      .select("*")
      .eq("cleaner_id", userId)
      .in("status", ["accepted", "in_progress"])
      .order("scheduled_at"),
  ]);

  if (platform.error || manual.error) {
    throw new Error(
      platform.error?.message ?? manual.error?.message ?? "cleaner_tasks_failed",
    );
  }

  return mergeCleanerTasks(
    (platform.data ?? []) as PlatformTaskRow[],
    (manual.data ?? []) as ManualTaskRow[],
  );
}
