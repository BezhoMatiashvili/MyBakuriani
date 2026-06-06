"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Reusable Supabase Realtime (websocket) primitives.
 *
 * These generalize the hand-rolled `supabase.channel(...).on("postgres_changes", ...)`
 * blocks that were copy-pasted across dashboards (see useNotifications, the renter
 * calendar/balance pages, service orders, cleaner tasks, etc.) so every live-updating
 * view shares one tested implementation instead of re-deriving channel lifecycle,
 * cleanup, and merge logic.
 *
 * Three patterns are observed in the codebase and supported here:
 *   1. id-keyed list merge   -> useRealtimeList({ mode: "merge" })   (notifications)
 *   2. single-row merge      -> useRealtimeRow                       (balance, profile)
 *   3. refetch-on-event      -> useRealtimeList({ mode: "refetch" }) (service orders, cleaner)
 *      (use when rows are scoped by a join/RLS that a postgres_changes filter can't express)
 *
 * Note on DB load: postgres_changes still reads the WAL and runs RLS per subscriber,
 * so it is not zero-cost on the database. The win over the previous approach is
 * eliminating refetch-on-refresh / polling — clients are pushed exactly the rows
 * that change, when they change.
 */

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

type AnyRow = Record<string, unknown>;

type ChangePayload = RealtimePostgresChangesPayload<AnyRow>;

export interface RealtimeBinding {
  /** Table name in the given schema (default "public"). Must be in the supabase_realtime publication. */
  table: string;
  /** Postgres event to listen for. Default "*". */
  event?: PostgresEvent;
  /** Server-side filter, e.g. `user_id=eq.${userId}`. Narrows what the DB pushes. */
  filter?: string;
  /** Schema name. Default "public". */
  schema?: string;
  /** Called for each matching change. Cast payload.new / payload.old to your row type. */
  handler: (payload: ChangePayload) => void;
}

export interface UseRealtimeOptions {
  /** When false, no channel is opened (e.g. while user is still loading). Default true. */
  enabled?: boolean;
  /** Override the auto-generated channel name. */
  channelName?: string;
}

/**
 * Low-level primitive: subscribe to one or more postgres_changes bindings on a single
 * channel and tear it down on unmount. Handlers are always called with the latest
 * closure, so you can reference fresh state without forcing a re-subscribe; the channel
 * only re-subscribes when the binding *shape* (table/event/filter/schema) changes.
 */
export function useRealtimeSubscription(
  bindings: RealtimeBinding[],
  options: UseRealtimeOptions = {},
): void {
  const { enabled = true } = options;
  const generatedId = useId();
  const channelName = options.channelName ?? `rt:${generatedId}`;

  // Keep the latest bindings (and their handlers) in a ref so renders that only
  // change handler closures don't tear down and re-open the websocket channel.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Re-subscribe only when the *shape* of the bindings changes, not their handlers.
  const signature = bindings
    .map(
      (b) =>
        `${b.schema ?? "public"}.${b.table}.${b.event ?? "*"}.${b.filter ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    if (!enabled) return;
    const active = bindingsRef.current;
    if (active.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(channelName);

    active.forEach((binding, index) => {
      channel.on(
        "postgres_changes",
        {
          event: binding.event ?? "*",
          schema: binding.schema ?? "public",
          table: binding.table,
          ...(binding.filter ? { filter: binding.filter } : {}),
        },
        (payload) => {
          // Dispatch to the latest handler at this binding index.
          bindingsRef.current[index]?.handler(payload as ChangePayload);
        },
      );
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channelName, signature]);
}

function rowId(row: unknown): string {
  return String((row as { id?: unknown })?.id);
}

function mergeChange<Row>(
  prev: Row[],
  payload: ChangePayload,
  getId: (row: Row) => string,
): Row[] {
  switch (payload.eventType) {
    case "INSERT": {
      const incoming = payload.new as Row;
      if (prev.some((r) => getId(r) === getId(incoming))) return prev;
      return [incoming, ...prev];
    }
    case "UPDATE": {
      const incoming = payload.new as Row;
      return prev.map((r) => (getId(r) === getId(incoming) ? incoming : r));
    }
    case "DELETE": {
      // payload.old carries (at least) the primary key even without REPLICA IDENTITY FULL.
      const removedId = getId(payload.old as Row);
      return prev.filter((r) => getId(r) !== removedId);
    }
    default:
      return prev;
  }
}

export interface UseRealtimeListOptions<Row> {
  /** Table to subscribe to (must be in the supabase_realtime publication). */
  table: string;
  /** Initial load. Use a full query (joins, ordering, RLS-scoped) — runs on mount and on refetch. */
  fetcher: () => Promise<Row[]>;
  /** Optional server-side filter for the subscription, e.g. `user_id=eq.${id}`. */
  filter?: string;
  schema?: string;
  /** When false, skips fetch + subscription. Default true. */
  enabled?: boolean;
  channelName?: string;
  /**
   * "merge"   — apply INSERT/UPDATE/DELETE payloads directly into local state (cheap, no extra query).
   *             Safe only when `filter` (or RLS) guarantees every pushed row belongs in this list.
   * "refetch" — re-run `fetcher` on any change. Use when rows are scoped by a join the
   *             postgres_changes filter can't express (e.g. service.owner_id).
   * Default "merge".
   */
  mode?: "merge" | "refetch";
  /** Optional comparator to keep the list ordered after merges. */
  sort?: (a: Row, b: Row) => number;
  /** Extract a stable id from a row. Default uses `row.id`. */
  getId?: (row: Row) => string;
}

export interface UseRealtimeListResult<Row> {
  rows: Row[];
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<Row[]>;
}

/**
 * Fetch a list once, then keep it live over a websocket. Replaces the
 * "fetch + channel.on(postgres_changes) + setState" boilerplate.
 */
export function useRealtimeList<Row>(
  options: UseRealtimeListOptions<Row>,
): UseRealtimeListResult<Row> {
  const {
    table,
    filter,
    schema,
    enabled = true,
    channelName,
    mode = "merge",
    sort,
    getId,
  } = options;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs so the subscription handler always sees the latest config without re-subscribing.
  const fetcherRef = useRef(options.fetcher);
  fetcherRef.current = options.fetcher;
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const getIdRef = useRef<(row: Row) => string>(getId ?? ((r) => rowId(r)));
  getIdRef.current = getId ?? ((r) => rowId(r));

  const applySort = useCallback((list: Row[]) => {
    const cmp = sortRef.current;
    return cmp ? [...list].sort(cmp) : list;
  }, []);

  const refetch = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      setRows(applySort(data));
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      return [];
    } finally {
      setLoading(false);
    }
  }, [applySort]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [enabled, refetch]);

  useRealtimeSubscription(
    enabled
      ? [
          {
            table,
            schema,
            event: "*",
            filter,
            handler: (payload) => {
              if (mode === "refetch") {
                void refetch();
                return;
              }
              setRows((prev) =>
                applySort(mergeChange(prev, payload, getIdRef.current)),
              );
            },
          },
        ]
      : [],
    { enabled, channelName },
  );

  return { rows, setRows, loading, error, refetch };
}

export interface UseRealtimeRowOptions<Row> {
  table: string;
  /** Initial load returning the single row (or null). */
  fetcher: () => Promise<Row | null>;
  /** Server-side filter scoping to the one row, e.g. `user_id=eq.${id}`. */
  filter?: string;
  schema?: string;
  enabled?: boolean;
  channelName?: string;
}

export interface UseRealtimeRowResult<Row> {
  row: Row | null;
  setRow: React.Dispatch<React.SetStateAction<Row | null>>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<Row | null>;
}

/**
 * Fetch a single row once, then keep it live. INSERT/UPDATE replace it with payload.new;
 * DELETE clears it. Use for per-user singletons like balance and profile.
 */
export function useRealtimeRow<Row>(
  options: UseRealtimeRowOptions<Row>,
): UseRealtimeRowResult<Row> {
  const { table, filter, schema, enabled = true, channelName } = options;

  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(options.fetcher);
  fetcherRef.current = options.fetcher;

  const refetch = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      setRow(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [enabled, refetch]);

  useRealtimeSubscription(
    enabled
      ? [
          {
            table,
            schema,
            event: "*",
            filter,
            handler: (payload) => {
              if (payload.eventType === "DELETE") {
                setRow(null);
                return;
              }
              setRow(payload.new as Row);
            },
          },
        ]
      : [],
    { enabled, channelName },
  );

  return { row, setRow, loading, error, refetch };
}
