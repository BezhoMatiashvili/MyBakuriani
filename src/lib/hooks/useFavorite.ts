"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { isMockPropertyId } from "@/lib/mock/properties";
import {
  subscribe,
  getFavoriteIds,
  ensureFavoritesLoaded,
  clearFavorites,
  setFavoriteLocal,
} from "@/lib/favorites/store";

/**
 * Favourite toggle for a property listing. Shared by listing cards and the
 * detail-page gallery. Reads favourite state from a shared per-user store (one
 * `favorites` fetch per page, not one per card — see `@/lib/favorites/store`),
 * then inserts/deletes a `favorites` row on toggle.
 *
 * Demo/mock listings have no real `properties` row, so favouriting them would
 * violate the FK — those clicks show a friendly notice instead of writing.
 */
export function useFavorite(propertyId: string) {
  const t = useTranslations("Favorites");
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) ensureFavoritesLoaded(user.id);
    else clearFavorites();
  }, [user]);

  const isFavorited = useSyncExternalStore(
    subscribe,
    () => getFavoriteIds().has(propertyId),
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
    if (isMockPropertyId(propertyId)) {
      toast.info(t("demoNotice"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (getFavoriteIds().has(propertyId)) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("property_id", propertyId);
        if (error) throw error;
        setFavoriteLocal(propertyId, false);
        toast.success(t("removed"));
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, property_id: propertyId });
        if (error) throw error;
        setFavoriteLocal(propertyId, true);
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
