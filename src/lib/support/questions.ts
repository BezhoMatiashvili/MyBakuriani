import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupportQuestionRow } from "./plan";

// The question log (C43): one anonymous row per answered question, written
// with the service role after the response has gone out (the route calls
// these inside after()), so it never slows an answer. A failed write is only
// logged: the chat does not depend on it.

export async function logQuestion(row: SupportQuestionRow): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("support_questions")
      .insert(row);
    if (error) console.warn(`[support] question log: ${error.message}`);
  } catch (err) {
    console.warn(
      "[support] question log:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** 👍/👎 on an answer, matched by its random ref; the first rating stays. */
export async function rateQuestion(
  ref: string,
  rating: "up" | "down",
): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("support_questions")
      .update({ rating })
      .eq("ref", ref)
      .is("rating", null);
    if (error) console.warn(`[support] question rating: ${error.message}`);
  } catch (err) {
    console.warn(
      "[support] question rating:",
      err instanceof Error ? err.message : err,
    );
  }
}
