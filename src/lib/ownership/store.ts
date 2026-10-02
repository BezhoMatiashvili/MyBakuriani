"use client";

import { createClient } from "@/lib/supabase/client";
import {
  OWNER_VERIFICATION_COLUMNS,
  type OwnerVerificationRow,
  type OwnershipListingKind,
} from "@/lib/ownership/types";

// The signed-in owner's ownership-verification requests (C39), read once per
// user and shared by every status chip and the ownership page — one request
// per page, not one per listing row. Keyed by listing; only the NEWEST request
// of each listing is kept, because its stored status is the whole rule.

type Listener = () => void;

const EMPTY_ROWS: ReadonlyMap<string, OwnerVerificationRow> = new Map();

// Module state outlives client-side navigation, and an admin decision or a
// basis-trigger revoke reaches no realtime channel, so a snapshot this old is
// read again on the next mount.
const DEFAULT_MAX_AGE_MS = 60_000;

let currentUserId: string | null = null;
let rows: ReadonlyMap<string, OwnerVerificationRow> = EMPTY_ROWS;
let loaded = false;
let loadedAt = 0;
let stale = false;
let failed = false;
let loadPromise: Promise<void> | null = null;
// Bumped by every load and every user change; only the newest load may write.
let generation = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function ownershipKey(kind: OwnershipListingKind, id: string): string {
  return `${kind}:${id}`;
}

export function subscribeOwnership(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Same object until the next successful load or user change. */
export function getOwnershipSnapshot(): ReadonlyMap<
  string,
  OwnerVerificationRow
> {
  return rows;
}

export function isOwnershipLoaded(): boolean {
  return loaded;
}

/** True when the newest load for the current user failed. */
export function hasOwnershipLoadFailed(): boolean {
  return failed;
}

/** The user the snapshot belongs to (null before the first load). */
export function getOwnershipUserId(): string | null {
  return currentUserId;
}

function startLoad(userId: string): Promise<void> {
  const mine = ++generation;
  const request = (async () => {
    const supabase = createClient();
    // Column grant: `select("*")` is permission denied (C34).
    const { data, error } = await supabase
      .from("ownership_verifications")
      .select(OWNER_VERIFICATION_COLUMNS)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // A newer load or another signed-in user owns the state now.
    if (mine !== generation) return;

    const next = new Map<string, OwnerVerificationRow>();
    for (const row of (data ?? []) as OwnerVerificationRow[]) {
      const key = row.property_id
        ? ownershipKey("property", row.property_id)
        : row.service_id
          ? ownershipKey("service", row.service_id)
          : null;
      // Newest first, so the first row seen for a listing is its latest.
      if (key && !next.has(key)) next.set(key, row);
    }
    rows = next;
    loaded = true;
    loadedAt = Date.now();
    stale = false;
    failed = false;
    emit();
  })();

  loadPromise = request;
  void request.then(
    () => {
      if (loadPromise === request) loadPromise = null;
    },
    () => {
      // Keep the last good snapshot; clearing the promise makes the failure
      // retryable by the next ensureOwnershipLoaded() call.
      if (loadPromise !== request) return;
      loadPromise = null;
      failed = true;
      emit();
    },
  );
  return request;
}

/**
 * Loads the signed-in user's requests unless a snapshot younger than
 * `maxAgeMs` exists (0: always read again, e.g. on the ownership page, where a
 * decision is acted on). Concurrent callers share one request; a different
 * user resets the state first. The old rows stay visible during a reload.
 */
export function ensureOwnershipLoaded(
  userId: string,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): Promise<void> {
  if (currentUserId !== userId) {
    currentUserId = userId;
    rows = EMPTY_ROWS;
    loaded = false;
    stale = false;
    failed = false;
    loadPromise = null;
    generation++;
    emit();
  } else {
    if (loadPromise) return loadPromise;
    if (loaded && !stale && Date.now() - loadedAt < maxAgeMs) {
      return Promise.resolve();
    }
  }
  return startLoad(userId);
}

/**
 * Marks the snapshot stale (after a submit, or when an admin decision may have
 * landed) and reloads it for the known user. The current rows stay visible
 * until the new ones arrive; listeners fire after the reload.
 */
export function invalidateOwnership(): void {
  stale = true;
  if (currentUserId) void startLoad(currentUserId);
}
