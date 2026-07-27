"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/useAuth";
import { isMockPropertyId } from "@/lib/mock/properties";
import { isMockServiceId } from "@/lib/mock/services";
import {
  subscribe,
  ensureFavoritesLoaded,
  clearFavorites,
  isFavorite,
  setFavorite,
  type FavoriteTarget,
} from "@/lib/favorites/store";

type UseFavoriteArgs =
  | { propertyId: string; serviceId?: undefined }
  | { serviceId: string; propertyId?: undefined };

/**
 * Favourite toggle for a property OR service listing (`favorites` rows have
 * exactly one of `property_id` / `service_id` — see the `favorites_exactly_one_ref`
 * check constraint). Shared by listing cards and detail-page galleries. Reads
 * favourite state from a shared per-user store (one `favorites` fetch per
 * page, not one per card — see `@/lib/favorites/store`), then inserts/deletes
 * a `favorites` row on toggle.
 *
 * Demo/mock listings have no real DB row, so favouriting them would violate
 * the FK — those clicks show a friendly notice instead of writing.
 */
export function useFavorite({ propertyId, serviceId }: UseFavoriteArgs) {
  const t = useTranslations("Favorites");
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const target: FavoriteTarget = propertyId
    ? { kind: "property", id: propertyId }
    : { kind: "service", id: serviceId! };

  useEffect(() => {
    if (user) ensureFavoritesLoaded(user.id);
    else clearFavorites();
  }, [user]);

  const isFavorited = useSyncExternalStore(
    subscribe,
    () => isFavorite(target),
    () => false,
  );

  async function toggle(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (busy) return;
    if (!user) {
      window.location.href = "/auth/login";
      return;
    }
    if (propertyId ? isMockPropertyId(propertyId) : isMockServiceId(target.id)) {
      toast.info(t("demoNotice"));
      return;
    }
    setBusy(true);
    try {
      // Capture the intention before awaiting hydration. A second card for
      // this listing can then queue the same desired state safely.
      const desiredState = !isFavorite(target);
      await setFavorite(user.id, target, desiredState);
      toast.success(t(desiredState ? "added" : "removed"));
    } catch {
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return { isFavorited, busy, toggle };
}
