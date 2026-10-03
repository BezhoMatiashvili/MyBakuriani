"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pathForLocale } from "@/lib/seo/alternates";

// A language's own name reads the same in every UI language, so these are not
// translated.
const ENDONYM = { ka: "ქართული", en: "English", ru: "Русский" } as const;

// Plain links to this page in the other languages. The header selector is a
// popover of buttons, so without these /en and /ru would be reachable only
// through hreflang and the sitemap, which crawlers that follow links (Bing,
// Yandex, AI bots) do not use (C40). The hrefs come from `pathForLocale`, the
// function behind the hreflang tags and the sitemap, so they are exactly the
// alternates. next-intl's `Link` is not used: with an explicit locale it keeps
// the default locale's prefix (`/ka/...`), which redirects.
export function FooterLanguageLinks() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("LanguageSelector");

  return (
    <nav
      aria-label={t("ariaLabel")}
      className="flex flex-wrap justify-center gap-x-6"
    >
      {routing.locales.map((loc) =>
        loc === locale ? (
          <span
            key={loc}
            aria-current="true"
            className="inline-flex min-h-11 items-center text-[12px] font-bold normal-case text-white sm:min-h-0"
          >
            {ENDONYM[loc]}
          </span>
        ) : (
          <a
            key={loc}
            href={pathForLocale(pathname, loc, routing.defaultLocale)}
            hrefLang={loc}
            lang={loc}
            className="inline-flex min-h-11 items-center text-[12px] font-bold normal-case transition-colors hover:text-white sm:min-h-0"
          >
            {ENDONYM[loc]}
          </a>
        ),
      )}
    </nav>
  );
}
