import "server-only";
import {
  audienceCabinetForRole,
  resolveAudience,
  type AudienceRows,
  type CabinetKey,
} from "@/lib/cabinets";
import type { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/types/database";

type Db = ReturnType<typeof createServiceClient>;
type Role = Database["public"]["Enums"]["user_role"];

// PostgREST caps a response at 1000 rows by default; page so a large audience
// is never silently truncated.
const PAGE_SIZE = 1000;

async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

/**
 * Users a notice aimed at `targetRoles` reaches: profile role matches, plus
 * users who hold a targeted role's cabinet through owned data (see
 * `resolveAudience`). Only the ownership tables the targeted cabinets can come
 * from are read. Throws on a query error.
 */
export async function loadAudienceUserIds(
  db: Db,
  targetRoles: readonly string[],
): Promise<Set<string>> {
  const cabinets = new Set<CabinetKey>();
  for (const role of targetRoles) {
    const cabinet = audienceCabinetForRole(role);
    if (cabinet) cabinets.add(cabinet);
  }
  const needsProperties = cabinets.has("renter") || cabinets.has("seller");
  const needsServices = [...cabinets].some(
    (c) => c !== "renter" && c !== "seller" && c !== "guest",
  );

  const [profiles, properties, services, tasks, members] = await Promise.all([
    targetRoles.length === 0
      ? []
      : fetchAll((from, to) =>
          db
            .from("profiles")
            .select("id, role")
            .in("role", targetRoles as Role[])
            .order("id")
            .range(from, to),
        ),
    needsProperties
      ? fetchAll((from, to) =>
          db
            .from("properties")
            .select("owner_id, is_for_sale")
            .order("id")
            .range(from, to),
        )
      : [],
    needsServices
      ? fetchAll((from, to) =>
          db
            .from("services")
            .select("owner_id, category")
            .order("id")
            .range(from, to),
        )
      : [],
    cabinets.has("cleaner")
      ? fetchAll((from, to) =>
          db
            .from("cleaning_tasks")
            .select("cleaner_id")
            .not("cleaner_id", "is", null)
            .order("id")
            .range(from, to),
        )
      : [],
    cabinets.has("seller")
      ? fetchAll((from, to) =>
          db
            .from("organization_members")
            .select("user_id")
            .eq("status", "approved")
            .order("id")
            .range(from, to),
        )
      : [],
  ]);

  const rows: AudienceRows = {
    profiles,
    properties,
    services,
    cleaningTaskCleanerIds: tasks.flatMap((t) =>
      t.cleaner_id ? [t.cleaner_id] : [],
    ),
    approvedMemberUserIds: members.map((m) => m.user_id),
  };
  return resolveAudience(targetRoles, rows);
}

type NotificationInsert =
  Database["public"]["Tables"]["notifications"]["Insert"];

// One statement fires two per-row triggers (scope, email enqueue) and one
// PostgREST body per call, so a large audience goes in bounded chunks.
const INSERT_CHUNK = 500;

/**
 * Inserts notification rows in chunks of 500. Stops at the first failing chunk
 * and reports how many rows were stored before it, so the caller can surface a
 * partial delivery instead of an all-or-nothing guess.
 */
export async function insertNotificationsChunked(
  db: Db,
  rows: NotificationInsert[],
): Promise<{ delivered: number; error: string | null }> {
  let delivered = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error } = await db.from("notifications").insert(chunk);
    if (error) return { delivered, error: error.message };
    delivered += chunk.length;
  }
  return { delivered, error: null };
}
