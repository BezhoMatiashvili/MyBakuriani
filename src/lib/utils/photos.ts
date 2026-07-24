// Guards SSR against legacy/oversized photo data. A few listings stored their
// photos as multi-MB base64 `data:` URLs instead of Storage URLs; embedding one
// in the server-rendered HTML + RSC payload + og:image pushes the response past
// Vercel's serverless function limit and the page 500s. sanitizePhotos drops any
// entry that isn't a lightweight, renderable reference so a bad row degrades to
// the "no photos" placeholder instead of crashing the route.
const MAX_PHOTO_REF_LENGTH = 2048;

const isRenderablePhoto = (value: string): boolean => {
  if (value.length > MAX_PHOTO_REF_LENGTH) return false;
  // Local placeholders are repository-controlled. Remote legacy values are
  // accepted only from this project's Storage origin, never arbitrary hosts.
  if (value.startsWith("/")) return !value.startsWith("//");
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === new URL(origin).origin &&
      /^\/storage\/v1\/object\/(public|sign)\//.test(url.pathname);
  } catch {
    return false;
  }
};

export function sanitizePhotos(
  photos: (string | null | undefined)[] | null | undefined,
): string[] {
  if (!photos) return [];
  return photos.filter(
    (p): p is string => typeof p === "string" && isRenderablePhoto(p),
  );
}
