import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import GuideEnd from "@/components/guide/GuideEnd";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import ZoneListings from "@/components/guide/ZoneListings";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { guideLinks } from "@/components/seo/richLinks";
import type { AppLocale } from "@/i18n/routing";
import {
  GUIDE_BASE_PATH,
  GUIDE_ZONE_SLUGS,
  isGuideZoneSlug,
  type GuideZoneSlug,
} from "@/lib/guide";
import { getGuideTranslator } from "@/lib/guide-content";
import { buildPageMetadata } from "@/lib/seo";

// ISR (C28): the copy is static, the nearby listings come from the cookie-free
// public client. Ten minutes, so a new listing shows up reasonably soon.
export const revalidate = 600;

// Only the four seeded zones have guide copy; the page answers notFound() for
// anything else. Not `dynamicParams = false`: in Next 15.5 a page of such a
// route 404s for good once one of its cache tags is revalidated on demand (an
// admin save), because the cache then holds no entry and the route has no
// fallback.
export function generateStaticParams() {
  return GUIDE_ZONE_SLUGS.map((zone) => ({ zone }));
}

// `Guide.meta.<prefix>Title/Description` per zone ("25ianebi" cannot start a
// key prefix the way the others read, so its prefix is z25).
const META_PREFIX = {
  didveli: "didveli",
  centri: "centri",
  kokhta: "kokhta",
  "25ianebi": "z25",
} as const satisfies Record<GuideZoneSlug, string>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale; zone: string }>;
}): Promise<Metadata> {
  const { locale, zone } = await params;
  if (!isGuideZoneSlug(zone)) return {};
  const t = await getGuideTranslator(locale);
  const prefix = META_PREFIX[zone];
  return buildPageMetadata({
    locale,
    path: `${GUIDE_BASE_PATH}/${zone}`,
    title: t(`meta.${prefix}Title`),
    description: t(`meta.${prefix}Description`),
  });
}

// One page per resort area (C40): what the area is, who it suits, and the
// daily-rent listings in it. The zone's name and one-line description are the
// site's own (`Zones.*`); the rest is `Guide.zone.<slug>.*`.
export default async function GuideZonePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; zone: string }>;
}) {
  const { locale, zone } = await params;
  if (!isGuideZoneSlug(zone)) notFound();

  const t = await getGuideTranslator(locale);
  const tZones = await getTranslations({ locale, namespace: "Zones" });

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[
          { name: t("crumb"), path: GUIDE_BASE_PATH },
          { name: tZones(`${zone}.name`), path: `${GUIDE_BASE_PATH}/${zone}` },
        ]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pt-4 sm:pt-6">
        <GuideHeading
          title={t(`zone.${zone}.h1`)}
          lead={t(`zone.${zone}.p1`)}
        />
        <p className="mt-4 text-[15px] font-medium leading-[27px] text-[#475569]">
          {t(`zone.${zone}.p2`)}
        </p>
        <GuideSection id="zone-suits" title={t("zone.suitsTitle")}>
          <p>{t.rich(`zone.${zone}.suitsP`, guideLinks)}</p>
        </GuideSection>
      </article>

      <ZoneListings locale={locale} slug={zone} />

      <div className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
        <GuideEnd locale={locale} page={zone} />
      </div>
    </>
  );
}
