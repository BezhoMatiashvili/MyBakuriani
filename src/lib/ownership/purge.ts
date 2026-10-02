import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

// Private bucket (C5, C39). This file is the ONLY code that deletes from it:
// scripts/check-contracts.mjs fails any other src file that does.
const BUCKET = "ownership-documents";

/**
 * Deletes the ownership documents that are safe to delete (C39, C37).
 *
 * One round: claim_ownership_documents_for_purge (the one definition of "safe
 * to delete", claimed under each owner's lock) → Storage remove → purged_at
 * stamped on EVERY claimed id, including a failed upload whose object never
 * landed. When the remove fails nothing is stamped: the claim lapses after
 * 10 minutes and a later run takes it again. Rounds repeat while one claims
 * something and the time budget lasts.
 *
 * Best effort: logs and never throws. The upload, submit and review routes
 * call it for one owner after their own work; the hourly cron route for all.
 */
export async function purgeOwnershipDocuments(
  opts: { ownerId?: string | null; limit?: number; budgetMs?: number } = {},
): Promise<{ purged: number; failed: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 8_000);
  const result = { purged: 0, failed: 0 };
  try {
    const db = createServiceClient();
    while (Date.now() < deadline) {
      // No owner: the SQL default (NULL) sweeps every owner.
      const { data: claimed, error: claimError } = await db.rpc(
        "claim_ownership_documents_for_purge",
        {
          p_limit: opts.limit ?? 50,
          ...(opts.ownerId ? { p_owner_id: opts.ownerId } : {}),
        },
      );
      if (claimError) {
        console.error("[ownership] purge claim failed", claimError.message);
        break;
      }
      if (!claimed?.length) break;

      const { error: removeError } = await db.storage
        .from(BUCKET)
        .remove(claimed.map((row) => row.storage_path));
      if (removeError) {
        console.error("[ownership] purge remove failed", removeError.message);
        result.failed += claimed.length;
        break;
      }

      const { error: stampError } = await db
        .from("ownership_verification_documents")
        .update({ purged_at: new Date().toISOString() })
        .in(
          "id",
          claimed.map((row) => row.id),
        );
      if (stampError) {
        // The objects are gone; the lapsed claim is retaken and stamped later.
        console.error("[ownership] purge stamp failed", stampError.message);
        result.failed += claimed.length;
        break;
      }
      result.purged += claimed.length;
    }
  } catch (error) {
    console.error("[ownership] purge failed", error);
  }
  return result;
}
