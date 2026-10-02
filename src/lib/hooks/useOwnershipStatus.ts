"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { subscribeAuthUser } from "@/lib/auth/session-store";
import {
  ensureOwnershipLoaded,
  getOwnershipSnapshot,
  getOwnershipUserId,
  hasOwnershipLoadFailed,
  invalidateOwnership,
  isOwnershipLoaded,
  ownershipKey,
  subscribeOwnership,
} from "@/lib/ownership/store";
import type {
  OwnerVerificationRow,
  OwnershipListingKind,
  OwnershipVerificationStatus,
} from "@/lib/ownership/types";

const EMPTY_ROWS: ReadonlyMap<string, OwnerVerificationRow> = new Map();
const getServerRows = () => EMPTY_ROWS;
const getServerUserId = () => null;
const getServerFalse = () => false;

/**
 * The signed-in user's requests from the shared store (@/lib/ownership/store).
 * The user comes from the shared session store, like useFavorite: one session
 * read for every chip on the page instead of one useAuth() per listing row.
 * `maxAgeMs` is how old a snapshot this mount accepts (store default if unset).
 */
function useOwnershipState(maxAgeMs?: number) {
  const [auth, setAuth] = useState<{ known: boolean; userId: string | null }>({
    known: false,
    userId: null,
  });

  useEffect(
    () =>
      subscribeAuthUser((user) => {
        const userId = user?.id ?? null;
        setAuth((prev) =>
          prev.known && prev.userId === userId ? prev : { known: true, userId },
        );
      }),
    [],
  );

  const { userId } = auth;
  useEffect(() => {
    if (userId) ensureOwnershipLoaded(userId, maxAgeMs);
  }, [userId, maxAgeMs]);

  const snapshot = useSyncExternalStore(
    subscribeOwnership,
    getOwnershipSnapshot,
    getServerRows,
  );
  const storeUserId = useSyncExternalStore(
    subscribeOwnership,
    getOwnershipUserId,
    getServerUserId,
  );
  const loaded = useSyncExternalStore(
    subscribeOwnership,
    isOwnershipLoaded,
    getServerFalse,
  );
  const failed = useSyncExternalStore(
    subscribeOwnership,
    hasOwnershipLoadFailed,
    getServerFalse,
  );

  // Never show a previous account's rows while the new user's load starts.
  const current = userId !== null && storeUserId === userId;
  return {
    authKnown: auth.known,
    userId,
    rows: current ? snapshot : EMPTY_ROWS,
    loaded: current && loaded,
    failed: current && failed,
  };
}

/**
 * One listing's newest request. `loading` stays true until this user's rows
 * have loaded — after a failed load too — so a chip never claims "unverified"
 * for a status it does not know.
 */
export function useOwnershipStatus(
  kind: OwnershipListingKind,
  id: string,
): {
  status: "none" | OwnershipVerificationStatus;
  note: string | null;
  loading: boolean;
} {
  const { authKnown, userId, rows, loaded } = useOwnershipState();
  const row = rows.get(ownershipKey(kind, id));
  const status = row?.status ?? "none";
  return {
    status,
    note:
      status === "rejected" || status === "revoked"
        ? (row?.decision_note ?? null)
        : null,
    loading: !authKnown || (userId !== null && !loaded),
  };
}

/**
 * Every listing's newest request, keyed by ownershipKey(). `refresh` reloads
 * them (after a submit) and never rejects: a failure shows up as `error`, with
 * the previous rows kept. `fresh` reads them again on mount whatever their age:
 * the ownership page is where an owner acts on a decision.
 */
export function useOwnershipStatuses({
  fresh = false,
}: { fresh?: boolean } = {}): {
  rows: ReadonlyMap<string, OwnerVerificationRow>;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const { authKnown, userId, rows, loaded, failed } = useOwnershipState(
    fresh ? 0 : undefined,
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (getOwnershipUserId() === userId) invalidateOwnership();
    await ensureOwnershipLoaded(userId).catch(() => undefined);
  }, [userId]);

  return {
    rows,
    loading: !authKnown || (userId !== null && !loaded && !failed),
    error: failed,
    refresh,
  };
}
