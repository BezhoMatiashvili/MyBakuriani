"use client";

import { useSyncExternalStore } from "react";
import type { BannerCreative } from "@/lib/banner-creative";
import { AD_PREVIEW_TTL_MS, parseAdPreviewHash } from "@/lib/ad-preview";
import { markStaffBrowser } from "@/lib/staff-browser";

/**
 * The admin's on-site ad preview on a public page (C47, 2026-10-11). An ad
 * card's "საიტზე ნახვა" lands on the placement's page with
 * `#mb-ad-preview=<id>`. startAdPreview() keeps the id in sessionStorage for
 * AD_PREVIEW_TTL_MS (reloads and client navigation keep the preview), removes
 * the hash, and loads the ad from the admin-only preview route with the
 * admin's cookies; anyone else gets 401/403 and nothing happens.
 * BannerSlotView reads it with useAdPreview(), and useSlotRotation shows it in
 * its placement on every load.
 */

const STORAGE_KEY = "mybakuriani:ad_preview";

type Stored = { id: string; until: number };

let current: BannerCreative | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit(next: BannerCreative | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (
      typeof parsed?.id === "string" &&
      typeof parsed.until === "number" &&
      parsed.until > Date.now()
    ) {
      return { id: parsed.id, until: parsed.until };
    }
  } catch {
    // unreadable: no preview
  }
  return null;
}

function writeStored(value: Stored | null): void {
  try {
    if (value) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: the preview lasts until the next full load.
  }
}

/** Once per page load, from AdPreviewBar (mounted only after hydration). */
export function startAdPreview(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const fromHash = parseAdPreviewHash(window.location.hash);
  if (fromHash) {
    writeStored({ id: fromHash, until: Date.now() + AD_PREVIEW_TTL_MS });
    // Deferred so Next has patched history: a null state keeps the router's
    // own URL in step, so the hash does not come back on the next render.
    setTimeout(() => {
      if (parseAdPreviewHash(window.location.hash)) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }, 0);
  }

  const id = fromHash ?? readStored()?.id;
  if (!id) return;

  fetch(`/api/admin/ads/${id}/preview`, { cache: "no-store" })
    .then(async (response) => {
      if ([401, 403, 404].includes(response.status)) {
        // Not an admin, or the ad is gone: no preview, silently.
        endAdPreview();
        return;
      }
      // A passing failure (5xx, 429): the stored id is tried on the next load.
      if (!response.ok) return;
      const payload = (await response.json()) as {
        creative?: BannerCreative | null;
      };
      if (!payload?.creative) {
        endAdPreview();
        return;
      }
      // Only an admin gets here: this browser stops counting (C47).
      markStaffBrowser();
      emit(payload.creative);
    })
    .catch(() => {
      // Offline: the stored id is tried again on the next load.
    });
}

export function endAdPreview(): void {
  writeStored(null);
  emit(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The previewed ad, or null. Null on the server and at hydration. */
export function useAdPreview(): BannerCreative | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
