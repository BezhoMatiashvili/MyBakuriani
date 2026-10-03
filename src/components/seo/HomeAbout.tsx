import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { richLinks } from "@/components/seo/richLinks";

// The home page's one block of running text: what the platform is, who posts
// the listings, and the three resort facts that rarely change, with real links
// to every section the cards above only reach through buttons (C40). Strings:
// messages `HomeAbout.*`, in ka/en/ru together.
export default async function HomeAbout({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "HomeAbout" });

  return (
    <section
      aria-labelledby="home-about-title"
      className="border-t border-[#E2E8F0] bg-white"
    >
      <div className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:py-14 lg:py-16">
        <div className="max-w-3xl">
          <h2
            id="home-about-title"
            className="text-[22px] font-black leading-[28px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
          >
            {t("title")}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] font-medium leading-[27px] text-[#475569]">
            <p>{t.rich("p1", richLinks)}</p>
            <p>{t.rich("p2", richLinks)}</p>
            <p>{t.rich("p3", richLinks)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
