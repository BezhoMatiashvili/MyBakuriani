import { getTranslations } from "next-intl/server";
import GuideSection from "@/components/guide/GuideSection";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  GUIDE_BASE_PATH,
  GUIDE_FACTS_CHECKED,
  GUIDE_PAGE_SOURCES,
  GUIDE_SOURCES,
  GUIDE_ZONE_SLUGS,
  type GuidePageKey,
} from "@/lib/guide";

// The closing blocks every guide page shares: links to the rest of the guide,
// the sources behind its figures and the date they were checked (C40). The
// anchors reuse each page's own H1 so the link text says what the page is.
export default async function GuideEnd({
  locale,
  page,
}: {
  locale: AppLocale;
  page: GuidePageKey;
}) {
  const t = await getTranslations({ locale, namespace: "Guide" });

  const links: { key: GuidePageKey; href: string; label: string }[] = [
    { key: "hub", href: GUIDE_BASE_PATH, label: t("hub.h1") },
    {
      key: "getting-there",
      href: `${GUIDE_BASE_PATH}/getting-there`,
      label: t("gettingThere.h1"),
    },
    {
      key: "ski-lifts",
      href: `${GUIDE_BASE_PATH}/ski-lifts`,
      label: t("skiLifts.h1"),
    },
    ...GUIDE_ZONE_SLUGS.map((slug) => ({
      key: slug,
      href: `${GUIDE_BASE_PATH}/${slug}`,
      label: t(`zone.${slug}.h1`),
    })),
  ];
  const sources = GUIDE_PAGE_SOURCES[page].map((id) => GUIDE_SOURCES[id]);
  const checked = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${GUIDE_FACTS_CHECKED}T00:00:00Z`));

  return (
    <>
      {page !== "hub" && (
        <GuideSection id="guide-also" title={t("alsoSee")}>
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {links
              .filter((link) => link.key !== page)
              .map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center font-semibold text-[#2563EB] underline-offset-2 hover:underline sm:min-h-9"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
          </ul>
        </GuideSection>
      )}
      <section
        aria-labelledby="guide-sources"
        className="mt-10 border-t border-[#E2E8F0] pt-6 sm:mt-12"
      >
        <h2
          id="guide-sources"
          className="text-[15px] font-black leading-[22px] text-[#1E293B]"
        >
          {t("sourcesTitle")}
        </h2>
        <ul className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center underline-offset-2 hover:underline sm:min-h-8"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {t("checked", { date: checked })}
        </p>
      </section>
    </>
  );
}
