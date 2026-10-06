import "server-only";
import { createHash } from "node:crypto";
import type { JevPlan, SupportReply } from "./plan";

// Exact-input response cache for the support assistant (C43). A key is the
// SHA-256 of everything the model would receive (models, prompt, tool,
// history, message or page elements), so a hit returns what that identical
// request already produced: it can never hand one user's answer to a
// different question. In memory only, bounded, gone on restart. Answers that
// read a user's own account status are never stored.

const SIX_HOURS = 6 * 60 * 60_000;

export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= Date.now()) return undefined;
    // Re-inserted: Map order is the recency order.
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** SHA-256 of a JSON-serialisable request body. */
export function cacheKey(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("base64url");
}

export const answerCache = new TtlCache<{ reply: SupportReply; model: string }>(
  300,
  SIX_HOURS,
);
export const planCache = new TtlCache<JevPlan>(300, SIX_HOURS);
