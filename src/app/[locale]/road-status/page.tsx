import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import RoadRouteMap from "@/components/landing/RoadRouteMap";
import LivePageEnd from "@/components/live/LivePageEnd";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { getLiveStatusCards } from "@/lib/status-cards/live";
import {
  LIVE_PAGE_PATHS,
  LIVE_PAGE_TIMEOUT_MS,
  readingCard,
} from "@/lib/status-cards/live-page";
import { pickLocalized } from "@/lib/status-cards/types";

const PATH = LIVE_PAGE_PATHS.road;

// ISR (C28): no cookies or headers. The status-card read (60 s cache) caps the
// effective interval at 60 s, as on the home page.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "LivePages" });
  return buildPageMetadata({
    locale,
    path: PATH,
    title: t("road.title"),
    description: t("road.description"),
  });
}

// The fixed Tbilisi -> Bakuriani route estimate (time, distance, traffic) as
// server HTML (C40), then the home road card's map. RoadRouteMap carries its
// own fixed-height box and the Google Maps link; the wrapper only gives that
// link a 44px target.
export default async function RoadStatusPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const [t, tCards, tFooter, cards] = await Promise.all([
    getTranslations({ locale, namespace: "LivePages" }),
    getTranslations({ locale, namespace: "StatusCards" }),
    getTranslations({ locale, namespace: "Footer" }),
    getLiveStatusCards(LIVE_PAGE_TIMEOUT_MS),
  ]);
  const road = readingCard(cards, "road");

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[{ name: tFooter("roadStatus"), path: PATH }]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pt-4 sm:pt-6">
        <GuideHeading title={t("road.h1")} lead={t("road.lead")} />

        <GuideSection id="live-road" title={tCards("road")}>
          {road ? (
            <dl>
              {road.items.map((item) => (
                <div key={item.id} className="flex flex-wrap gap-x-3">
                  <dt className="font-semibold text-[#1E293B]">
                    {pickLocalized(item.label, locale)}
                  </dt>
                  <dd>{pickLocalized(item.value, locale)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{t("unavailable")}</p>
          )}
          <div className="[&>div>a]:inline-flex [&>div>a]:min-h-11 [&>div>a]:items-center">
            <RoadRouteMap />
          </div>
        </GuideSection>
      </article>
      <LivePageEnd locale={locale} page="road" />
    </>
  );
}
