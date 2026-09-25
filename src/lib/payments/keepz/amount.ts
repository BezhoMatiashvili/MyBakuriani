/**
 * Card top-up amounts, handled as integer tetri (1 ₾ = 100 tetri) so no float
 * ever reaches Keepz — it rejects amounts with more than two decimals (6058).
 *
 * Keepz sells wallet credit 1:1: whatever the card pays is credited, and every
 * purchase is then priced by its own RPC. So a client-chosen amount only needs
 * bounds, never price math (C32).
 *
 * Pure module (no imports) so scripts/unit can load it.
 */

/** 1 ₾ — the smallest card payment; smaller shortfalls round up to it. */
export const MIN_CARD_TOPUP_TETRI = 100;
/** 2000 ₾ — covers the largest single purchase (365 days of SUPER VIP = 1825 ₾). */
export const MAX_CARD_TOPUP_TETRI = 200_000;

/** GEL amount with at most two decimals → tetri; null for anything else. */
export function gelToTetri(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const tetri = Math.round(value * 100);
  // 10.005 is rejected rather than rounded; 0.1 + 0.2 float noise is not.
  if (Math.abs(tetri - value * 100) > 1e-6) return null;
  return tetri;
}

export function isValidCardTopupTetri(tetri: number): boolean {
  return (
    Number.isInteger(tetri) &&
    tetri >= MIN_CARD_TOPUP_TETRI &&
    tetri <= MAX_CARD_TOPUP_TETRI
  );
}

/** The JSON number sent to Keepz: integer tetri / 100 has at most 2 decimals. */
export function tetriToGel(tetri: number): number {
  return tetri / 100;
}

/**
 * Card amount for a purchase the wallet cannot cover: the missing part, never
 * below the 1 ₾ minimum. 0 means the wallet already covers the purchase.
 * Both inputs are 2-decimal GEL amounts (NUMERIC(10,2) columns).
 */
export function cardShortfallTetri(
  totalGel: number,
  balanceGel: number,
): number {
  const missing = Math.round(totalGel * 100) - Math.round(balanceGel * 100);
  if (missing <= 0) return 0;
  return Math.max(missing, MIN_CARD_TOPUP_TETRI);
}
