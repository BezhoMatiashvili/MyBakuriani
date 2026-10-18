// Contact numbers for the OWNER/ADMIN PREVIEW render of a listing detail page.
//
// Why this exists: the public contact-reveal endpoint
// (src/app/api/listings/[kind]/[id]/contact/route.ts) hard-filters
// `status = 'active'`, so an owner previewing their own still-pending listing
// gets a 404 and the reveal button shows "ნომრის ნახვა ვერ მოხერხდა — სცადეთ
// თავიდან". That is correct for the public endpoint and must NOT be relaxed;
// the preview page simply already holds the row, so it can pass the number in
// directly — exactly what FoodDetailClient has always done.
//
// C28 boundary (load-bearing, read before changing):
// on the public ISR path these read as null ONLY because the anon-facing views
// `public_properties` / `public_services` expose neither `phone` nor
// `whatsapp`. If either column is ever added to those views, contact numbers
// would enter cacheable, viewer-independent HTML. Keep those views narrow.
type ContactRow = {
  phone?: string | null;
  whatsapp?: string | null;
  profiles?:
    | { phone?: string | null }
    | Array<{ phone?: string | null }>
    | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function ownerProfilePhone(row: ContactRow): string | null {
  const profiles = row.profiles;
  if (!profiles) return null;
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return clean(profile?.phone);
}

// Listing's own number, falling back to the owner profile's — mirroring the
// fallback the contact API itself applies.
export function previewContactPhone(row: ContactRow | null): string | null {
  if (!row) return null;
  return clean(row.phone) ?? ownerProfilePhone(row);
}

// No profile fallback: WhatsApp is a per-listing field, and a profile phone is
// not evidence the owner uses WhatsApp on it.
export function previewContactWhatsapp(row: ContactRow | null): string | null {
  if (!row) return null;
  return clean(row.whatsapp);
}
