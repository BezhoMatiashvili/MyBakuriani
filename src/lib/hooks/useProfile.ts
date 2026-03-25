"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export function useProfile(userId?: string) {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      setError(null);

      try {
        // If no userId provided, get current user
        let id = userId;
        if (!id) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          id = user?.id;
        }

        if (!id) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;
        setProfile(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch profile",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [userId]);

  async function updateProfile(updates: ProfileUpdate) {
    setError(null);

    try {
      let id = userId;
      if (!id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        id = user?.id;
      }

      if (!id) throw new Error("No user ID available");

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;
      setProfile(data);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update profile";
      setError(message);
      throw err;
    }
  }

  return {
    profile,
    loading,
    error,
    updateProfile,
  };
}
