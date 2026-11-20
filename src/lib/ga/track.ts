import { GA_MEASUREMENT_ID } from "./config";
import type { GaEventName, GaEventParams } from "./core";

// The call sites' entry to Google Analytics (C62). On a build without
// NEXT_PUBLIC_GA_MEASUREMENT_ID it returns at once; with it, the GA client is
// loaded on first use, so a page that never sends an event never loads it.
export function trackGa(name: GaEventName, params?: GaEventParams): void {
  if (!GA_MEASUREMENT_ID) return;
  void import("./client")
    .then((mod) => mod.gaEvent(name, params))
    .catch(() => {
      // Analytics must never affect the action.
    });
}
