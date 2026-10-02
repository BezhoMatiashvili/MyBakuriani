import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  loadCleaningTaskOwnerDetails,
  mergeCleanerTasks,
  type CleanerTaskItem,
  type ManualTaskRow,
  type PlatformTaskRow,
} from "@/lib/cleaner/tasks";
import { isRetryableDbError, withRetry } from "@/lib/with-timeout";

/**
 * Loads the cleaner's open platform and manual work. Shared by the server page
 * (initial render) and client realtime refetch so every overview render obeys
 * the two-source cleaner-work contract.
 *
 * The apartment and owner come from the cleaner-scoped RPC, never from
 * embedding `properties`/`profiles`: RLS returns null for both to a non-owner.
 */
export async function loadCleanerTasks(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CleanerTaskItem[]> {
  const [platform, manual, ownerDetails] = await Promise.all([
    supabase
      .from("cleaning_tasks")
      .select("*")
      .eq("cleaner_id", userId)
      .in("status", [
        "pending",
        "accepted",
        "cancellation_requested",
        "in_progress",
      ])
      .order("scheduled_at"),
    supabase
      .from("cleaner_manual_tasks")
      .select("*")
      .eq("cleaner_id", userId)
      .in("status", ["accepted", "in_progress"])
      .order("scheduled_at"),
    withRetry(() => loadCleaningTaskOwnerDetails(supabase), isRetryableDbError),
  ]);

  if (platform.error || manual.error) {
    throw new Error(
      platform.error?.message ?? manual.error?.message ?? "cleaner_tasks_failed",
    );
  }

  // Apartment/owner details must not blank the dashboard if they fail to load
  // (e.g. a deploy that precedes its migration): the tasks still render.
  if (ownerDetails.error) {
    console.error("cleaner_owner_details_failed", ownerDetails.error);
  }

  return mergeCleanerTasks(
    (platform.data ?? []) as PlatformTaskRow[],
    (manual.data ?? []) as ManualTaskRow[],
    ownerDetails.data ?? [],
  );
}
