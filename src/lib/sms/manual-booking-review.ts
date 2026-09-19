import "server-only";

export function manualReviewUrl(token: string, locale: string) {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app"
  ).replace(/\/$/, "");
  const localePrefix = locale === "ka" ? "" : `/${locale}`;
  return `${origin}${localePrefix}/review/${token}`;
}
