/** Convert the stable edge-function conflict into localized UI copy. */
export async function promotionPurchaseError(
  error: unknown,
  vipConflictMessage: string,
): Promise<Error> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = (await context.clone().json()) as { error?: unknown };
      if (payload.error === "vip_tier_conflict") {
        return new Error(vipConflictMessage);
      }
    } catch {
      // The generic FunctionsHttpError message remains the safe fallback.
    }
  }
  return error instanceof Error ? error : new Error("Promotion purchase failed");
}
