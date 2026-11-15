import { metaPixelIdFrom } from "./pixel-id";

// The only reader of NEXT_PUBLIC_META_PIXEL_ID (C59). Inlined at build time:
// unset (or not 6-20 digits) = no Pixel, no banner or privacy change at all.
export const META_PIXEL_ID = metaPixelIdFrom(
  process.env.NEXT_PUBLIC_META_PIXEL_ID,
);
