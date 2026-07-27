"use client";

import { createClient } from "@/lib/supabase/client";

type Listener = () => void;

export type FavoriteTarget =
  | { kind: "property"; id: string }
  | { kind: "service"; id: string };

let currentUserId: string | null = null;
let favoriteKeys = new Set<string>();
let loaded = false;
let loadPromise: Promise<void> | null = null;
const mutationQueues = new Map<string, Promise<void>>();
const listeners = new Set<Listener>();

function targetKey(target: FavoriteTarget): string {
  return `${target.kind}:${target.id}`;
}

function targetColumn(target: FavoriteTarget): "property_id" | "service_id" {
  return target.kind === "property" ? "property_id" : "service_id";
}

function emit() {
  for (const listener of listeners) listener();
}

function setFavoriteLocal(target: FavoriteTarget, isFavorited: boolean) {
  const key = targetKey(target);
  const next = new Set(favoriteKeys);
  if (isFavorited) next.add(key);
  else next.delete(key);
  favoriteKeys = next;
  emit();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isFavorite(target: FavoriteTarget): boolean {
  return favoriteKeys.has(targetKey(target));
}

export function areFavoritesLoaded(): boolean {
  return loaded;
}

/**
 * Hydrates the signed-in user's favourites once. A failed request leaves the
 * previous known state untouched and can be retried by the next caller.
 */
export function ensureFavoritesLoaded(userId: string): Promise<void> {
  if (currentUserId === userId && loaded) return Promise.resolve();
  if (currentUserId === userId && loadPromise) return loadPromise;

  if (currentUserId !== userId) {
    currentUserId = userId;
    favoriteKeys = new Set();
    loaded = false;
    mutationQueues.clear();
    emit();
  }

  const request = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("favorites")
      .select("property_id, service_id")
      .eq("user_id", userId);

    if (error) throw error;

    // Do not let a stale response overwrite the next signed-in user's state.
    if (currentUserId !== userId) return;

    favoriteKeys = new Set(
      (data ?? []).flatMap((row) => {
        if (row.property_id) return [targetKey({ kind: "property", id: row.property_id })];
        if (row.service_id) return [targetKey({ kind: "service", id: row.service_id })];
        return [];
      }),
    );
    loaded = true;
    emit();
  })();

  loadPromise = request;
  void request.catch(() => {
    // Keep the last successful snapshot (if any); do not turn a failed load
    // into an empty favourites state. Clearing this also makes the failure
    // retryable on the next interaction.
    if (currentUserId === userId && loadPromise === request) {
      loadPromise = null;
      emit();
    }
  });
  void request.then(
    () => {
      if (currentUserId === userId && loadPromise === request) loadPromise = null;
    },
    () => undefined,
  );
  return request;
}

/**
 * Serializes writes for one typed target. The caller supplies its intended
 * state before waiting for hydration, so concurrent cards cannot accidentally
 * transform an add into a remove.
 */
export function setFavorite(
  userId: string,
  target: FavoriteTarget,
  desiredState: boolean,
): Promise<void> {
  const key = targetKey(target);
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    await ensureFavoritesLoaded(userId);
    if (currentUserId !== userId) {
      throw new Error("Favourite user changed before the mutation completed");
    }

    if (isFavorite(target) === desiredState) return;

    const supabase = createClient();
    const column = targetColumn(target);
    if (desiredState) {
      const { error } = await supabase
        .from("favorites")
        .insert({ user_id: userId, [column]: target.id });

      // A stale client can legitimately race an existing row. PostgreSQL's
      // unique index is authoritative; reconcile only that specific outcome.
      if (error && error.code !== "23505") throw error;
      setFavoriteLocal(target, true);
      return;
    }

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq(column, target.id);
    if (error) throw error;
    setFavoriteLocal(target, false);
  });

  mutationQueues.set(key, operation);
  void operation.then(() => {
    if (mutationQueues.get(key) === operation) mutationQueues.delete(key);
  }, () => {
    if (mutationQueues.get(key) === operation) mutationQueues.delete(key);
  });
  return operation;
}

/** Clears the in-memory state on sign-out. */
export function clearFavorites() {
  if (currentUserId === null && favoriteKeys.size === 0 && !loaded) return;
  currentUserId = null;
  favoriteKeys = new Set();
  loaded = false;
  loadPromise = null;
  mutationQueues.clear();
  emit();
}
