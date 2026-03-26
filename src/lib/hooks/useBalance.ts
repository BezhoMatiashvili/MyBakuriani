"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Balance = Database["public"]["Tables"]["balances"]["Row"];

export function useBalance() {
  const supabase = createClient();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setBalance(null);
          setLoading(false);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("balances")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (fetchError) throw fetchError;
        setBalance(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch balance",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function topUp(amount: number) {
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Placeholder: In production, this would integrate with a payment gateway
      // and be handled server-side via an Edge Function
      console.warn("topUp is a placeholder — integrate with payment gateway");

      return { success: false, message: "Payment gateway not yet integrated" };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to top up balance";
      setError(message);
      throw err;
    }
  }

  return {
    balance,
    loading,
    error,
    topUp,
  };
}
