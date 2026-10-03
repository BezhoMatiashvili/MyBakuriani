import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { GUIDE_ZONE_SLUGS } from "@/lib/guide";

/**
 * A listing picked from the zone list stores the zone's Georgian name as its
 * area. This returns a lookup that shows that name in the page's language (the
 * site's own `Zones.<slug>.name`); any other text, typed by the owner, stays as
 * typed. Georgian pages need no lookup. Load it once per render, then call it
 * for each listing (C40).
 */
export async function areaNamer(
  locale: AppLocale,
): Promise<(location: string | null) => string | null> {
  if (locale === "ka") return (location) => location;
  const [ka, own] = await Promise.all([
    getTranslations({ locale: "ka", namespace: "Zones" }),
    getTranslations({ locale, namespace: "Zones" }),
  ]);
  const byKaName = new Map(
    GUIDE_ZONE_SLUGS.map((slug) => [ka(`${slug}.name`), own(`${slug}.name`)]),
  );
  return (location) => (location ? (byKaName.get(location) ?? location) : null);
}
