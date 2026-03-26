"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Property = Database["public"]["Tables"]["properties"]["Row"];

type PropertyType = Database["public"]["Enums"]["property_type"];
type ListingStatus = Database["public"]["Enums"]["listing_status"];

interface PropertyFilters {
  type?: PropertyType;
  status?: ListingStatus;
  location?: string;
  priceRange?: { min?: number; max?: number };
  rooms?: number;
  isForSale?: boolean;
}

export function useProperties() {
  const supabase = createClient();
  const [properties, setProperties] = useState<Property[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(
    async (filters?: PropertyFilters, page = 1, limit = 12) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase.from("properties").select("*", { count: "exact" });

        if (filters?.type) {
          query = query.eq("type", filters.type);
        }
        if (filters?.status) {
          query = query.eq("status", filters.status);
        }
        if (filters?.location) {
          query = query.ilike("location", `%${filters.location}%`);
        }
        if (filters?.priceRange?.min !== undefined) {
          query = query.gte("price_per_night", filters.priceRange.min);
        }
        if (filters?.priceRange?.max !== undefined) {
          query = query.lte("price_per_night", filters.priceRange.max);
        }
        if (filters?.rooms !== undefined) {
          query = query.eq("rooms", filters.rooms);
        }
        if (filters?.isForSale !== undefined) {
          query = query.eq("is_for_sale", filters.isForSale);
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.range(from, to).order("created_at", { ascending: false });

        const { data, error: fetchError, count } = await query;

        if (fetchError) throw fetchError;
        setProperties(data ?? []);
        return { data: data ?? [], count };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch properties";
        setError(message);
        return { data: [], count: 0 };
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const getById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;
      setProperty(data);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch property";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    properties,
    property,
    loading,
    error,
    list,
    getById,
  };
}
