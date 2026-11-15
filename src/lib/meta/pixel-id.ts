// The Pixel ID rule (C59), on its own and import-free: config.ts is imported
// by the layout and by page bundles, so it must not pull in core.ts (a shared
// module that size makes webpack add a chunk to every page, unset builds too).

/** Digits only, 6-20 long; anything else leaves the Pixel off. */
export function metaPixelIdFrom(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^\d{6,20}$/.test(id) ? id : null;
}
