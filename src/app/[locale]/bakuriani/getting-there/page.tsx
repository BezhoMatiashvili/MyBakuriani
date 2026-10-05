import type { Metadata } from "next";
import GuideEnd from "@/components/guide/GuideEnd";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import FaqList from "@/components/seo/FaqList";
import { guideLinks } from "@/components/seo/richLinks";
import type { AppLocale } from "@/i18n/routing";
import { GUIDE_BASE_PATH } from "@/lib/guide";
import { getGuideTranslator } from "@/lib/guide-content";
import { buildPageMetadata } from "@/lib/seo";

const PATH = `${GUIDE_BASE_PATH}/getting-there`;

// ISR (C28): copy only, no cookies or headers. Ten minutes, the same as the
// admin-edited copy's cache (src/lib/guide-content.ts), so an edit reaches
// visitors behind the edge cache within that.
export const revalidate = 600;

const QUESTIONS = [1, 2, 3, 4] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getGuideTranslator(locale);
  return buildPageMetadata({
    locale,
    path: PATH,
    title: t("meta.gettingThereTitle"),
    description: t("meta.gettingThereDescription"),
  });
}

// How to reach Bakuriani (C40): car or transfer, minibus, the narrow-gauge
// railway's status, and what to check first. Strings: `Guide.gettingThere.*`.
export default async function GettingTherePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getGuideTranslator(locale);

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[
          { name: t("crumb"), path: GUIDE_BASE_PATH },
          { name: t("gettingThere.crumb"), path: PATH },
        ]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:pb-16 sm:pt-6">
        <GuideHeading
          title={t("gettingThere.h1")}
          lead={t("gettingThere.lead")}
        />

        <GuideSection id="guide-car" title={t("gettingThere.carTitle")}>
          <p>{t.rich("gettingThere.carP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-bus" title={t("gettingThere.busTitle")}>
          <p>{t("gettingThere.busP1")}</p>
        </GuideSection>

        <GuideSection id="guide-train" title={t("gettingThere.trainTitle")}>
          <p>{t("gettingThere.trainP1")}</p>
        </GuideSection>

        <GuideSection id="guide-before" title={t("gettingThere.beforeTitle")}>
          <p>{t.rich("gettingThere.beforeP1", guideLinks)}</p>
        </GuideSection>

        <GuideSection id="guide-faq" title={t("faqTitle")}>
          <FaqList
            items={QUESTIONS.map((n) => ({
              question: t(`gettingThere.q${n}`),
              answer: t.rich(`gettingThere.a${n}`, guideLinks),
            }))}
          />
        </GuideSection>

        <GuideEnd locale={locale} page="getting-there" />
      </article>
    </>
  );
}
