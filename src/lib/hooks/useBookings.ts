"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];

export function useBookings() {
  const supabase = createClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
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
        .from("bookings")
        .select("*")
        .or(`guest_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setBookings(data ?? []);
      return data ?? [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch bookings";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(booking: BookingInsert) {
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("bookings")
        .insert(booking)
        .select()
        .single();

      if (insertError) throw insertError;
      setBookings((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create booking";
      setError(message);
      throw err;
    }
  }

  async function updateStatus(
    id: string,
    status: "pending" | "confirmed" | "cancelled" | "completed",
  ) {
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;
      setBookings((prev) => prev.map((b) => (b.id === id ? data : b)));
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update booking status";
      setError(message);
      throw err;
    }
  }

  return {
    bookings,
    loading,
    error,
    list,
    create,
    updateStatus,
  };
}
