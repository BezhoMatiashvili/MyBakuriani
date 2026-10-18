import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import GuideEnd from "@/components/guide/GuideEnd";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import FaqList from "@/components/seo/FaqList";
import JsonLd from "@/components/seo/JsonLd";
import { guideLinks } from "@/components/seo/richLinks";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { GUIDE_BASE_PATH, GUIDE_ZONE_SLUGS } from "@/lib/guide";
import { getGuideTranslator } from "@/lib/guide-content";
import { buildPageMetadata } from "@/lib/seo";
import { pathForLocale } from "@/lib/seo/alternates";
import { touristDestinationJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/seo/site";

// ISR (C28): copy only, no cookies or headers. Ten minutes, the same as the
// admin-edited copy's cache (src/lib/guide-content.ts), so an edit reaches
// visitors behind the edge cache within that.
export const revalidate = 600;

const FACTS = [
  "where",
  "elevation",
  "fromTbilisi",
  "fromBorjomi",
  "season",
  "climate",
] as const;
const QUESTIONS = [1, 2, 3, 4, 5] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getGuideTranslator(locale);
  return buildPageMetadata({
    locale,
    path: GUIDE_BASE_PATH,
    title: t("meta.hubTitle"),
    description: t("meta.hubDescription"),
  });
}

// The resort guide's front page (C40): what Bakuriani is, when to go, the four
// areas, skiing and the road, with links into every other guide page and the
// listing categories. Strings: messages `Guide.hub.*`, ka/en/ru together.
export default async function GuideHubPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getGuideTranslator(locale);
  const tZones = await getTranslations({ locale, namespace: "Zones" });
  const tSeo = await getTranslations({ locale, namespace: "Seo" });

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[{ name: t("crumb"), path: GUIDE_BASE_PATH }]}
      />
      <JsonLd
        data={touristDestinationJsonLd({
          url: new URL(
            pathForLocale(GUIDE_BASE_PATH, locale, routing.defaultLocale),
            SITE_URL,
          ).href,
          name: tSeo("locality"),
          description: t("hub.lead"),
          region: tSeo("region"),
          inLanguage: locale,
        })}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:pb-16 sm:pt-6">
        <GuideHeading title={t("hub.h1")} lead={t("hub.lead")} />

        <section aria-labelledby="guide-facts" className="mt-8">
          <h2
            id="guide-facts"
            className="text-[17px] font-black leading-[22px] text-[#1E293B]"
          >
            {t("hub.factsTitle")}
          </h2>
          <dl className="mt-3 grid gap-px overflow-hidden rounded-[16px] border border-[#E2E8F0] bg-[#E2E8F0] sm:grid-cols-2">
            {FACTS.map((fact) => (
              <div key={fact} className="bg-white px-4 py-3">
                <dt className="text-[13px] font-bold leading-[20px] text-[#64748B]">
                  {t(`hub.${fact}Label`)}
                </dt>
                <dd className="mt-0.5 text-[15px] font-semibold leading-[22px] text-[#1E293B]">
                  {t(`hub.${fact}Value`)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <GuideSection id="guide-when" title={t("hub.whenTitle")}>
          <p>{t("hub.winter")}</p>
          <p>{t("hub.summer")}</p>
          <p>{t("hub.events")}</p>
        </GuideSection>

        <GuideSection id="guide-areas" title={t("hub.areasTitle")}>
          <p>{t("hub.areasLead")}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {GUIDE_ZONE_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  href={`${GUIDE_BASE_PATH}/${slug}`}
                  className="block h-full rounded-[16px] border border-[#E2E8F0] bg-white p-4 transition-shadow hover:shadow-[var(--shadow-card-hover)]"
                >
                  <span className="block text-[17px] font-black leading-[22px] text-[#1E293B]">
                    {tZones(`${slug}.name`)}
                  </span>
                  <span className="mt-1 block text-[14px] font-medium leading-[22px] text-[#475569]">
                    {tZones(`${slug}.description`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GuideSection>

        <GuideSection id="guide-skiing" title={t("hub.skiingTitle")}>
          <p>{t("hub.skiingP1")}</p>
          <p>{t.rich("hub.skiingP2", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-getting" title={t("hub.gettingTitle")}>
          <p>{t.rich("hub.gettingP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-stay" title={t("hub.stayTitle")}>
          <p>{t.rich("hub.stayP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-faq" title={t("faqTitle")}>
          <FaqList
            items={QUESTIONS.map((n) => ({
              question: t(`hub.q${n}`),
              answer: t.rich(`hub.a${n}`, guideLinks),
            }))}
          />
        </GuideSection>

        <GuideEnd locale={locale} page="hub" />
      </article>
    </>
  );
}
