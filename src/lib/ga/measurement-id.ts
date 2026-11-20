// The GA4 Measurement ID rule (C62), on its own and import-free: config.ts is
// imported by the layout and by page bundles, so it must stay this small.

/** "G-" and 4-16 capitals or digits; anything else leaves Google Analytics off. */
export function gaMeasurementIdFrom(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return /^G-[A-Z0-9]{4,16}$/.test(id) ? id : null;
}
