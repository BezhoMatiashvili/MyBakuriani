"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type SmartMatchRequest =
  Database["public"]["Tables"]["smart_match_requests"]["Row"];
type SmartMatchInsert =
  Database["public"]["Tables"]["smart_match_requests"]["Insert"];

export function useSmartMatch() {
  const supabase = createClient();
  const [requests, setRequests] = useState<SmartMatchRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error: fetchError } = await supabase
        .from("smart_match_requests")
        .select("*")
        .eq("guest_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRequests(data ?? []);
      return data ?? [];
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch smart match requests";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  async function create(preferences: Omit<SmartMatchInsert, "guest_id">) {
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error: insertError } = await supabase
        .from("smart_match_requests")
        .insert({ ...preferences, guest_id: user.id })
        .select()
        .single();

      if (insertError) throw insertError;
      setRequests((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create smart match request";
      setError(message);
      throw err;
    }
  }

  return {
    requests,
    loading,
    error,
    list,
    create,
  };
}
