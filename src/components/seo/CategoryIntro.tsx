import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import FaqList from "@/components/seo/FaqList";
import { richLinks } from "@/components/seo/richLinks";
import { isSeedListingId } from "@/lib/seo/sitemap";

export type IntroTopic =
  | "apartments"
  | "hotels"
  | "sales"
  | "food"
  | "transport"
  | "entertainment"
  | "services"
  | "employment";

const QUESTIONS = [1, 2, 3] as const;

// Server-rendered copy under a category's listing grid: the text Google reads
// to understand what the page is for, with links into the rest of the site and
// the answers to three real questions. The answers live in native <details>, so
// they are collapsed for people but present in the HTML for crawlers (C40).
// Strings: messages `CategoryIntro.<topic>.*`, in ka/en/ru together.
//
// `listings` is every listing the page loaded. The grid above shows nine at a
// time through buttons, so the rest had no link a crawler could follow (a
// link-graph crawl found sales pages reachable only through the sitemap). They
// are listed here as plain links in a native <details>, which is collapsed for
// people and in the HTML for crawlers (C40). Every topic's route is
// `/<topic>/<id>`, the same URL `propertyViewUrl`/`serviceViewUrl` return for
// what that page queries.
export default async function CategoryIntro({
  locale,
  topic,
  listings,
}: {
  locale: AppLocale;
  topic: IntroTopic;
  listings?: ReadonlyArray<{ id: string; title: string | null }> | null;
}) {
  const t = await getTranslations({ locale, namespace: "CategoryIntro" });
  const headingId = `${topic}-intro-title`;
  const linked = (listings ?? []).filter(
    (l) => l.title?.trim() && !isSeedListingId(l.id),
  );

  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-[#E2E8F0] bg-white"
    >
      <div className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:py-14 lg:py-16">
        <div className="max-w-3xl">
          <h2
            id={headingId}
            className="text-[22px] font-black leading-[28px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
          >
            {t(`${topic}.title`)}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] font-medium leading-[27px] text-[#475569]">
            <p>{t.rich(`${topic}.p1`, richLinks)}</p>
            <p>{t.rich(`${topic}.p2`, richLinks)}</p>
          </div>

          <h3 className="mt-10 text-[17px] font-black leading-[22px] text-[#1E293B]">
            {t("faqTitle")}
          </h3>
          <FaqList
            className="mt-4"
            items={QUESTIONS.map((n) => ({
              question: t(`${topic}.q${n}`),
              answer: t.rich(`${topic}.a${n}`, richLinks),
            }))}
          />
        </div>

        {linked.length > 0 ? (
          <details className="group mt-10 rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3 text-[15px] font-bold text-[#1E293B] [&::-webkit-details-marker]:hidden">
              <span>{t("allListings", { count: linked.length })}</span>
              <ChevronDown
                aria-hidden="true"
                className="ml-4 h-5 w-5 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-180"
              />
            </summary>
            <ul className="grid gap-x-8 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {linked.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/${topic}/${l.id}`}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center break-words text-[14px] font-medium text-[#2563EB] hover:underline sm:min-h-9"
                  >
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
