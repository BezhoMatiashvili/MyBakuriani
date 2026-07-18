"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { isMockPropertyId } from "@/lib/mock/properties";
import { isMockServiceId } from "@/lib/mock/services";
import {
  subscribe,
  getFavoriteIds,
  ensureFavoritesLoaded,
  clearFavorites,
  setFavoriteLocal,
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
  const id = propertyId ?? serviceId;
  const column = propertyId ? "property_id" : "service_id";

  useEffect(() => {
    if (user) ensureFavoritesLoaded(user.id);
    else clearFavorites();
  }, [user]);

  const isFavorited = useSyncExternalStore(
    subscribe,
    () => getFavoriteIds().has(id),
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
    if (propertyId ? isMockPropertyId(propertyId) : isMockServiceId(id)) {
      toast.info(t("demoNotice"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (getFavoriteIds().has(id)) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq(column, id);
        if (error) throw error;
        setFavoriteLocal(id, false);
        toast.success(t("removed"));
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, [column]: id });
        if (error) throw error;
        setFavoriteLocal(id, true);
        toast.success(t("added"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return { isFavorited, busy, toggle };
}
