/**
 * A cleaner's day mixes two record types that live in two tables:
 *
 *   - platform jobs  — `cleaning_tasks`, created by a property owner calling the
 *     cleaner out. Owner-derived title/address/contact, RPC-driven transitions.
 *   - manual jobs    — `cleaner_manual_tasks`, typed in by the cleaner for an
 *     off-platform client. Owned outright by the cleaner, written directly.
 *
 * The schedule page needs them in one sorted list, so both normalize into
 * `CleanerTaskItem` here rather than branching in the JSX.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/types/database";

export type CleanerTaskTransitionStatus =
  | "accepted"
  | "declined"
  | "cancellation_requested"
  | "cancelled"
  | "in_progress"
  | "completed";

export interface CreateCleaningTaskArgs {
  p_property_id: string;
  p_cleaner_service_id: string;
  p_cleaning_type: string;
  p_scheduled_at: string;
  p_notes: string | null;
  p_address: string | null;
}

export interface CleanerTaskRpcError {
  code?: string;
  message?: string;
}

export interface CleaningTaskCleanerDetails {
  task_id: string;
  cleaner_name: string;
  cleaner_avatar_url: string | null;
  phone: string | null;
  whatsapp: string | null;
}

interface CleanerTaskRpcClient {
  rpc(
    name: "transition_cleaning_task",
    args: {
      p_task_id: string;
      p_status: CleanerTaskTransitionStatus;
    },
  ): PromiseLike<{ error: unknown | null }>;
}

interface CreateCleanerTaskRpcClient {
  rpc(
    name: "create_cleaning_task",
    args: CreateCleaningTaskArgs,
  ): PromiseLike<{
    data: Tables<"cleaning_tasks"> | null;
    error: CleanerTaskRpcError | null;
  }>;
}

interface CleanerTaskDetailsRpcClient {
  rpc(name: "get_my_cleaning_task_cleaner_details"): PromiseLike<{
    data: CleaningTaskCleanerDetails[] | null;
    error: unknown | null;
  }>;
}

/**
 * What a cleaner may know about the apartment and its owner for their own
 * call-outs. Every field except `task_id` is null (or false) once a call-out is
 * declined or cancelled.
 */
export interface CleaningTaskOwnerDetails {
  task_id: string;
  owner_name: string | null;
  owner_avatar_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  property_id: string | null;
  property_title: string | null;
  property_location: string | null;
  property_lat: number | null;
  property_lng: number | null;
  property_type: string | null;
  property_is_for_sale: boolean;
  property_is_active: boolean;
  property_area_sqm: number | null;
  property_rooms: number | null;
  property_bathrooms: number | null;
}

interface CleanerTaskOwnerDetailsRpcClient {
  rpc(name: "get_my_cleaning_task_owner_details"): PromiseLike<{
    data: CleaningTaskOwnerDetails[] | null;
    error: unknown | null;
  }>;
}

export type PlatformTaskRow = Tables<"cleaning_tasks">;

export type ManualTaskRow = Tables<"cleaner_manual_tasks">;

export interface CleanerTaskItem {
  id: string;
  source: "platform" | "manual";
  /** Card heading. Null when the details lookup returned no listing. */
  title: string | null;
  address: string | null;
  /** The address is just the listing's area name, so the exact one must be asked for. */
  addressAreaOnly: boolean;
  /** Who to call. Platform: the owner. Manual: the off-platform client. */
  contactName: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactAvatar: string | null;
  /** False when no details row came back for a platform call-out (lookup failed or lost a race). */
  detailsLoaded: boolean;
  /** The listing the call-out is for (platform only): enough to describe it and open it. */
  propertyId: string | null;
  propertyType: string | null;
  propertyIsForSale: boolean;
  /** Only an active listing has a public page. */
  propertyIsActive: boolean;
  areaSqm: number | null;
  rooms: number | null;
  bathrooms: number | null;
  /** The apartment's pin (platform only), for a directions link. */
  propertyLat: number | null;
  propertyLng: number | null;
  cleaningType: string;
  scheduledAt: string;
  price: number | null;
  /** What `price` is per (e.g. "საათი"); null for manual jobs. */
  priceUnit: string | null;
  status: string;
  notes: string | null;
  /** The cleaner's own service package the owner picked, when the call-out recorded one. */
  serviceTitle: string | null;
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

/** Typed boundary for the address-aware, server-priced call-out RPC. */
export async function createPlatformCleanerTask(
  supabase: SupabaseClient<Database>,
  args: CreateCleaningTaskArgs,
): Promise<{
  data: Tables<"cleaning_tasks"> | null;
  error: CleanerTaskRpcError | null;
}> {
  return await (supabase as unknown as CreateCleanerTaskRpcClient).rpc(
    "create_cleaning_task",
    args,
  );
}

/** Participant-safe renter projection for cleaner identity and contact data. */
export async function loadCleaningTaskCleanerDetails(
  supabase: SupabaseClient<Database>,
): Promise<{
  data: CleaningTaskCleanerDetails[] | null;
  error: unknown | null;
}> {
  return await (supabase as unknown as CleanerTaskDetailsRpcClient).rpc(
    "get_my_cleaning_task_cleaner_details",
  );
}

/**
 * Participant-safe projection of the apartment and owner for the cleaner's own
 * call-outs. Never embed `properties`/`profiles` in the task query instead:
 * RLS hides both from everyone but the owner, so a real cleaner would get null
 * for the apartment, the owner and the owner's number.
 */
export async function loadCleaningTaskOwnerDetails(
  supabase: SupabaseClient<Database>,
): Promise<{
  data: CleaningTaskOwnerDetails[] | null;
  error: unknown | null;
}> {
  return await (supabase as unknown as CleanerTaskOwnerDetailsRpcClient).rpc(
    "get_my_cleaning_task_owner_details",
  );
}

/** `numeric` columns can arrive as strings; keep null as null. */
function toNumber(value: number | string | null | undefined): number | null {
  return value == null ? null : Number(value);
}

export function fromPlatformTask(
  row: PlatformTaskRow,
  details?: CleaningTaskOwnerDetails,
): CleanerTaskItem {
  const typedAddress = row.address?.trim() || null;
  const area = details?.property_location?.trim() || null;
  return {
    id: row.id,
    source: "platform",
    title: details?.property_title ?? null,
    address: row.address ?? details?.property_location ?? null,
    // No address typed (the database fell back to the listing's location), or
    // the owner left the prefilled location untouched: the cleaner only has the area.
    addressAreaOnly:
      area !== null && (typedAddress === null || typedAddress === area),
    contactName: details?.owner_name ?? null,
    contactPhone: details?.phone ?? null,
    contactWhatsapp: details?.whatsapp ?? null,
    contactAvatar: details?.owner_avatar_url ?? null,
    detailsLoaded: details !== undefined,
    propertyId: details?.property_id ?? null,
    propertyType: details?.property_type ?? null,
    propertyIsForSale: details?.property_is_for_sale ?? false,
    propertyIsActive: details?.property_is_active ?? false,
    areaSqm: toNumber(details?.property_area_sqm),
    rooms: details?.property_rooms ?? null,
    bathrooms: details?.property_bathrooms ?? null,
    propertyLat: toNumber(details?.property_lat),
    propertyLng: toNumber(details?.property_lng),
    cleaningType: row.cleaning_type,
    scheduledAt: row.scheduled_at,
    price: row.price == null ? null : Number(row.price),
    priceUnit: row.price_unit,
    status: row.status ?? "accepted",
    notes: row.notes,
    serviceTitle: row.service_title?.trim() || null,
    manual: null,
  };
}

export function fromManualTask(row: ManualTaskRow): CleanerTaskItem {
  return {
    id: row.id,
    source: "manual",
    title: row.client_name,
    address: row.address,
    addressAreaOnly: false,
    contactName: row.client_name,
    contactPhone: row.client_phone,
    contactWhatsapp: null,
    contactAvatar: null,
    detailsLoaded: true,
    propertyId: null,
    propertyType: null,
    propertyIsForSale: false,
    propertyIsActive: false,
    areaSqm: null,
    rooms: null,
    bathrooms: null,
    propertyLat: null,
    propertyLng: null,
    cleaningType: row.cleaning_type,
    scheduledAt: row.scheduled_at,
    price: row.price == null ? null : Number(row.price),
    priceUnit: null,
    status: row.status,
    notes: row.notes,
    serviceTitle: null,
    manual: row,
  };
}

/**
 * What `propertyViewUrl` needs for a link to the apartment's public page, or
 * null when it has none: the public detail routes only serve active listings,
 * and a call-out can be for a draft the owner has not published.
 */
export function listingLinkTarget(
  task: Pick<
    CleanerTaskItem,
    "propertyId" | "propertyType" | "propertyIsForSale" | "propertyIsActive"
  >,
): { id: string; is_for_sale: boolean; type: string | null } | null {
  return task.propertyId && task.propertyIsActive
    ? {
        id: task.propertyId,
        is_for_sale: task.propertyIsForSale,
        type: task.propertyType,
      }
    : null;
}

/**
 * A refetch whose details lookup failed (one aborted request on a weak signal is
 * enough) must not blank what the cleaner already has on screen: a platform task
 * that comes back without details but had them in `previous` keeps the apartment
 * and the owner it had, while its status, time, price and notes are the new ones.
 * A task that never had details stays without them, so Confirm keeps waiting. A
 * call-out's address is fixed when it is created, so the carried one is current.
 */
export function keepLoadedDetails(
  previous: CleanerTaskItem[],
  next: CleanerTaskItem[],
): CleanerTaskItem[] {
  const known = new Map(
    previous
      .filter((task) => task.source === "platform" && task.detailsLoaded)
      .map((task) => [task.id, task]),
  );
  return next.map((task) => {
    const old =
      task.source === "platform" && !task.detailsLoaded
        ? known.get(task.id)
        : undefined;
    if (!old) return task;
    return {
      ...task,
      title: old.title,
      address: task.address ?? old.address,
      addressAreaOnly: old.addressAreaOnly,
      contactName: old.contactName,
      contactPhone: old.contactPhone,
      contactWhatsapp: old.contactWhatsapp,
      contactAvatar: old.contactAvatar,
      detailsLoaded: true,
      propertyId: old.propertyId,
      propertyType: old.propertyType,
      propertyIsForSale: old.propertyIsForSale,
      propertyIsActive: old.propertyIsActive,
      areaSqm: old.areaSqm,
      rooms: old.rooms,
      bathrooms: old.bathrooms,
      propertyLat: old.propertyLat,
      propertyLng: old.propertyLng,
    };
  });
}

/**
 * Merge both sources into one chronological list. `ownerDetails` comes from
 * `loadCleaningTaskOwnerDetails`; a platform task without a matching entry
 * still renders, just without apartment/owner details.
 */
export function mergeCleanerTasks(
  platform: PlatformTaskRow[],
  manual: ManualTaskRow[],
  ownerDetails: CleaningTaskOwnerDetails[] = [],
): CleanerTaskItem[] {
  const detailsByTask = new Map(ownerDetails.map((d) => [d.task_id, d]));
  return [
    ...platform.map((row) => fromPlatformTask(row, detailsByTask.get(row.id))),
    ...manual.map(fromManualTask),
  ].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}
