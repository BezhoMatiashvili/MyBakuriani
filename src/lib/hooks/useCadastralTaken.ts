"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isValidCadastralCode } from "@/lib/utils/number";

/**
 * Best-effort "is this cadastral code already taken?" check as the user types.
 *
 * RLS hides other users' pending listings, so a `false` result is not a hard
 * guarantee — the DB unique index (`idx_properties_cadastral_unique`) plus the
 * `23505` catch at submit is the real gate. This exists purely to warn the user
 * early instead of only at submit.
 *
 * `excludeId` is the id of the listing being edited, so a listing never flags
 * its own unchanged code as a duplicate.
 */
export function useCadastralTaken(
  code: string,
  excludeId: string | null,
): boolean {
  const [taken, setTaken] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const value = code.trim();
    if (timer.current) clearTimeout(timer.current);
    setTaken(false);
    // Only worth a round-trip once the code is a plausibly-complete cadastral code.
    if (!isValidCadastralCode(value)) return;

    timer.current = setTimeout(async () => {
      let query = createClient()
        .from("properties")
        .select("id")
        .eq("cadastral_code", value)
        .limit(1);
      if (excludeId) query = query.neq("id", excludeId);
      const { data, error } = await query;
      // On error stay silent rather than block a legitimate submit.
      if (!error) setTaken((data?.length ?? 0) > 0);
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [code, excludeId]);

  return taken;
}

/** True when a Supabase write failed on the cadastral-code unique index. */
export function isCadastralDuplicateError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; message?: string; details?: string };
  return (
    e.code === "23505" &&
    `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase().includes("cadastral")
  );
}
