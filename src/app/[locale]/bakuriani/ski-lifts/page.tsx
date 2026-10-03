import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import GuideEnd from "@/components/guide/GuideEnd";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import FaqList from "@/components/seo/FaqList";
import { guideLinks } from "@/components/seo/richLinks";
import type { AppLocale } from "@/i18n/routing";
import { GUIDE_BASE_PATH } from "@/lib/guide";
import { buildPageMetadata } from "@/lib/seo";

const PATH = `${GUIDE_BASE_PATH}/ski-lifts`;

// ISR (C28): copy only, no cookies or headers.
export const revalidate = 3600;

const QUESTIONS = [1, 2, 3, 4] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Guide" });
  return buildPageMetadata({
    locale,
    path: PATH,
    title: t("meta.skiLiftsTitle"),
    description: t("meta.skiLiftsDescription"),
  });
}

// The ski zones, the season and where to check opening dates (C40). Prices and
// ticket rules are left out on purpose: they change every season. Strings:
// `Guide.skiLifts.*`; the season dates are announcements, worded as such.
export default async function SkiLiftsPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Guide" });

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[
          { name: t("crumb"), path: GUIDE_BASE_PATH },
          { name: t("skiLifts.crumb"), path: PATH },
        ]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:pb-16 sm:pt-6">
        <GuideHeading title={t("skiLifts.h1")} lead={t("skiLifts.lead")} />

        <GuideSection id="guide-zones" title={t("skiLifts.zonesTitle")}>
          <p>{t("skiLifts.didveli")}</p>
          <p>{t("skiLifts.kokhta")}</p>
          <p>{t("skiLifts.mitarbi")}</p>
          <p>{t("skiLifts.crystal")}</p>
        </GuideSection>

        <GuideSection id="guide-season" title={t("skiLifts.seasonTitle")}>
          <p>{t("skiLifts.seasonP1")}</p>
          <p>{t.rich("skiLifts.seasonP2", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-pass" title={t("skiLifts.passTitle")}>
          <p>{t("skiLifts.passP1")}</p>
        </GuideSection>

        <GuideSection id="guide-beginners" title={t("skiLifts.beginnersTitle")}>
          <p>{t.rich("skiLifts.beginnersP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-stay" title={t("skiLifts.stayTitle")}>
          <p>{t.rich("skiLifts.stayP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-faq" title={t("faqTitle")}>
          <FaqList
            items={QUESTIONS.map((n) => ({
              question: t(`skiLifts.q${n}`),
              answer: t.rich(`skiLifts.a${n}`, guideLinks),
            }))}
          />
        </GuideSection>

        <GuideEnd locale={locale} page="ski-lifts" />
      </article>
    </>
  );
}
