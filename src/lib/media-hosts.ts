// The Supabase hosts whose Storage objects the site renders (C6). One list
// feeds both next.config.ts `images.remotePatterns` and the middleware CSP, so
// the image optimizer and the browser allow exactly the same origins. No
// imports on purpose: next.config.ts loads this file directly.

/**
 * The production project's host. Staging rows restored from a prod dump still
 * point at it (banners, ads, organization logos/covers, avatars, project
 * updates, menus), so every environment allows it alongside its own project.
 */
export const PROD_SUPABASE_HOST = "yuwyrmxccrpfjvidwhhg.supabase.co";

/**
 * The configured project's host. Falls back to the prod host when
 * NEXT_PUBLIC_SUPABASE_URL is unset, which only happens when a tool loads
 * next.config.ts without app env (e.g. `next lint` in CI).
 */
export const SUPABASE_PROJECT_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : PROD_SUPABASE_HOST;

export const SUPABASE_MEDIA_HOSTS =
  SUPABASE_PROJECT_HOST === PROD_SUPABASE_HOST
    ? [PROD_SUPABASE_HOST]
    : [SUPABASE_PROJECT_HOST, PROD_SUPABASE_HOST];
