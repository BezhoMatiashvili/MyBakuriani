"use client";

import { useEffect, useState } from "react";
import { FALLBACK_ZONES, type Zone } from "@/lib/zones/types";

/**
 * Client-side hook for active zones. Returns the fallback list immediately
 * so the UI never flashes empty, then upgrades to the live admin-managed
 * list as soon as /api/zones responds.
 */
export function useActiveZones(): { zones: Zone[]; loading: boolean } {
  const [zones, setZones] = useState<Zone[]>(FALLBACK_ZONES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/zones", { signal: AbortSignal.timeout(8_000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (
          payload &&
          Array.isArray(payload.zones) &&
          payload.zones.length > 0
        ) {
          setZones(payload.zones as Zone[]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { zones, loading };
}
