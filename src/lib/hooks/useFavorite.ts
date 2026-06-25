"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { isMockPropertyId } from "@/lib/mock/properties";

/**
 * Favourite toggle for a property listing. Shared by listing cards and the
 * detail-page gallery. Loads the current state for the signed-in user, then
 * inserts/deletes a `favorites` row on toggle.
 *
 * Demo/mock listings have no real `properties` row, so favouriting them would
 * violate the FK — those clicks show a friendly notice instead of writing.
 */
export function useFavorite(propertyId: string) {
  const t = useTranslations("Favorites");
  const { user } = useAuth();
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setFavoriteId(null);
      return;
    }
    const supabase = createClient();
    let alive = true;
    async function loadFavorite() {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user!.id)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (alive) setFavoriteId(data?.id ?? null);
    }
    loadFavorite();
    return () => {
      alive = false;
    };
  }, [propertyId, user]);

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
      if (favoriteId) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("id", favoriteId);
        if (error) throw error;
        setFavoriteId(null);
        toast.success(t("removed"));
      } else {
        const { data, error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, property_id: propertyId })
          .select("id")
          .single();
        if (error) throw error;
        setFavoriteId(data.id);
        toast.success(t("added"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return { isFavorited: favoriteId != null, busy, toggle };
}
