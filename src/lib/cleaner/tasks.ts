/**
 * A cleaner's day mixes two record types that live in two tables:
 *
 *   - platform jobs  — `cleaning_tasks`, created by a property owner calling the
 *     cleaner out. Owner-derived title/address/contact, RPC-driven transitions.
 *   - manual jobs    — `cleaner_manual_tasks`, typed in by the cleaner for an
 *     off-platform client. Owned outright by the cleaner, written directly.
 *
 * The schedule and earnings pages both need them in one sorted list, so both
 * normalize into `CleanerTaskItem` here rather than branching in the JSX.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type CleanerTaskTransitionStatus =
  | "accepted"
  | "declined"
  | "in_progress"
  | "completed";

interface CleanerTaskRpcClient {
  rpc(
    name: "transition_cleaning_task",
    args: {
      p_task_id: string;
      p_status: CleanerTaskTransitionStatus;
    },
  ): PromiseLike<{ error: unknown | null }>;
}

export type PlatformTaskRow = Tables<"cleaning_tasks"> & {
  properties: Pick<Tables<"properties">, "title" | "location"> | null;
  profiles:
    | (Pick<Tables<"profiles">, "display_name" | "phone"> & {
        avatar_url?: string | null;
      })
    | null;
};

export type ManualTaskRow = Tables<"cleaner_manual_tasks">;

export interface CleanerTaskItem {
  id: string;
  source: "platform" | "manual";
  /** Card heading. Null for platform rows with no readable listing embed. */
  title: string | null;
  address: string | null;
  /** Who to call. Platform: the owner. Manual: the off-platform client. */
  contactName: string | null;
  contactPhone: string | null;
  contactAvatar: string | null;
  cleaningType: string;
  scheduledAt: string;
  price: number | null;
  status: string;
  notes: string | null;
  /** The original manual row, so the edit modal can seed itself. */
  manual: ManualTaskRow | null;
}

/** Calendar key in the browser's local timezone; never derive it with ISO split. */
export function toLocalDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Typed boundary for an RPC that predates the generated database definitions. */
export async function transitionPlatformCleanerTask(
  supabase: SupabaseClient<Database>,
  taskId: string,
  status: CleanerTaskTransitionStatus,
): Promise<{ error: unknown | null }> {
  return await (supabase as unknown as CleanerTaskRpcClient).rpc(
    "transition_cleaning_task",
    {
      p_task_id: taskId,
      p_status: status,
    },
  );
}

export function fromPlatformTask(row: PlatformTaskRow): CleanerTaskItem {
  return {
    id: row.id,
    source: "platform",
    // The properties/profiles embeds are RLS-filtered to null for a cleaner, so
    // these are usually null in practice; the card renders its own fallback.
    title: row.properties?.title ?? null,
    address: row.address ?? row.properties?.location ?? null,
    contactName: row.profiles?.display_name ?? null,
    contactPhone: row.profiles?.phone ?? null,
    contactAvatar: row.profiles?.avatar_url ?? null,
    cleaningType: row.cleaning_type,
    scheduledAt: row.scheduled_at,
    price: row.price == null ? null : Number(row.price),
    status: row.status ?? "accepted",
    notes: row.notes,
    manual: null,
  };
}

export function fromManualTask(row: ManualTaskRow): CleanerTaskItem {
  return {
    id: row.id,
    source: "manual",
    title: row.client_name,
    address: row.address,
    contactName: row.client_name,
    contactPhone: row.client_phone,
    contactAvatar: null,
    cleaningType: row.cleaning_type,
    scheduledAt: row.scheduled_at,
    price: row.price == null ? null : Number(row.price),
    status: row.status,
    notes: row.notes,
    manual: row,
  };
}

/** Merge both sources into one chronological list. */
export function mergeCleanerTasks(
  platform: PlatformTaskRow[],
  manual: ManualTaskRow[],
): CleanerTaskItem[] {
  return [
    ...platform.map(fromPlatformTask),
    ...manual.map(fromManualTask),
  ].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}
