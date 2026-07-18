"use client";

/**
 * Shared per-user favourites store.
 *
 * Why: every PropertyCard used to call `useFavorite`, which fired its own
 * `favorites` query per card — a list page rendered 60+ identical round trips
 * that piled onto the DB and stalled to the browser fetch timeout. This store
 * loads the signed-in user's favourited ids (properties AND services, merged
 * into one id set — the two tables generate independent UUIDs so there's no
 * collision risk) ONCE and lets every card read from it, so a list page does
 * a single `favorites` fetch regardless of card count. Toggles update the
 * store optimistically so hearts stay in sync across cards showing the same
 * listing.
 */

import { createClient } from "@/lib/supabase/client";

type Listener = () => void;

let currentUserId: string | null = null;
let favoriteIds = new Set<string>();
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFavoriteIds(): Set<string> {
  return favoriteIds;
}

/**
 * Loads the user's favourites once. Re-runs only when the user id changes, so
 * concurrent callers (every card mounting at once) share a single fetch.
 */
export function ensureFavoritesLoaded(userId: string): Promise<void> {
  if (currentUserId === userId && loadPromise) return loadPromise;

  currentUserId = userId;
  favoriteIds = new Set();
  loadPromise = (async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("favorites")
      .select("property_id, service_id")
      .eq("user_id", userId);
    // Guard against a user switch that started mid-flight.
    if (currentUserId === userId) {
      favoriteIds = new Set(
        (data ?? [])
          .map((row) => row.property_id ?? row.service_id)
          .filter((id): id is string => id != null),
      );
      emit();
    }
  })();
  return loadPromise;
}

/** Clears the store on sign-out. No-op (and no re-render) when already empty. */
export function clearFavorites() {
  if (currentUserId === null && favoriteIds.size === 0) return;
  currentUserId = null;
  favoriteIds = new Set();
  loadPromise = null;
  emit();
}

/** Optimistic local update applied after a successful toggle write. */
export function setFavoriteLocal(propertyId: string, isFavorited: boolean) {
  const next = new Set(favoriteIds);
  if (isFavorited) next.add(propertyId);
  else next.delete(propertyId);
  favoriteIds = next;
  emit();
}
