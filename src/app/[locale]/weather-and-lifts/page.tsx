import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
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
import { liftTextFromStatus } from "@/lib/status-cards/lifts";
import { pickLocalized } from "@/lib/status-cards/types";
import { formatStatusUpdatedAt } from "@/lib/status-cards/updated-at";

const PATH = LIVE_PAGE_PATHS.weather;

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
    title: t("weather.title"),
    description: t("weather.description"),
  });
}

// The live weather with its forecast, and the hand-kept lift status with the
// date of the admin's last change, as server HTML (C40). Lifts are never
// called live: the page says when they were updated.
export default async function WeatherAndLiftsPage({
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
  const weather = readingCard(cards, "weather");
  const lifts = readingCard(cards, "lifts");
  const weatherNote = weather ? pickLocalized(weather.subValue, locale) : "";

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[{ name: tFooter("weatherLifts"), path: PATH }]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pt-4 sm:pt-6">
        <GuideHeading title={t("weather.h1")} lead={t("weather.lead")} />

        <GuideSection id="live-weather" title={tCards("weather")}>
          {weather ? (
            <>
              <p className="text-[22px] font-black leading-[28px] text-[#1E293B]">
                {pickLocalized(weather.value, locale)}
              </p>
              {weatherNote && <p>{weatherNote}</p>}
              <ul>
                {weather.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap justify-between gap-x-3"
                  >
                    <span>
                      <span className="font-semibold text-[#1E293B]">
                        {pickLocalized(item.label, locale)}
                      </span>{" "}
                      {pickLocalized(item.detail, locale)}
                    </span>
                    <span className="font-semibold text-[#1E293B]">
                      {pickLocalized(item.value, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t("unavailable")}</p>
          )}
        </GuideSection>

        <GuideSection id="live-lifts" title={tCards("lifts")}>
          {lifts ? (
            <>
              <ul>
                {lifts.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap justify-between gap-x-3"
                  >
                    <span className="font-semibold text-[#1E293B]">
                      {pickLocalized(item.label, locale)}
                    </span>
                    <span>
                      {pickLocalized(item.value, locale) ||
                        pickLocalized(liftTextFromStatus(item.status), locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-[20px] text-[#64748B]">
                {tCards("updatedAt", {
                  date: formatStatusUpdatedAt(lifts.updatedAt, locale) ?? "",
                })}
              </p>
            </>
          ) : (
            <p>{t("unavailable")}</p>
          )}
        </GuideSection>
      </article>
      <LivePageEnd locale={locale} page="weather" />
    </>
  );
}
