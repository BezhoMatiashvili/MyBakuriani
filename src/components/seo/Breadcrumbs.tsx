import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import JsonLd from "@/components/seo/JsonLd";
import { pathForLocale } from "@/lib/seo/alternates";
import { breadcrumbListJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/seo/site";

export interface Crumb {
  name: string;
  /** Locale-less path: "/apartments", "/apartments/<uuid>". */
  path: string;
}

// The visible trail and its BreadcrumbList markup come from the same `trail`,
// so Google never sees a breadcrumb the page does not show (C40). The last
// crumb is the page itself and is not a link.
export default async function Breadcrumbs({
  locale,
  items,
  narrow = false,
  width,
}: {
  locale: AppLocale;
  items: readonly Crumb[];
  /** Align with a `max-w-3xl` page column instead of the 1160px container. */
  narrow?: boolean;
  /** Any other column, as its Tailwind `max-w-*` class (`narrow` wins). */
  width?: string;
}) {
  const t = await getTranslations({ locale, namespace: "Breadcrumbs" });
  const trail: Crumb[] = [{ name: t("home"), path: "/" }, ...items];
  const absolute = (path: string) =>
    new URL(pathForLocale(path, locale, routing.defaultLocale), SITE_URL).href;

  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd(
          trail.map((crumb) => ({
            name: crumb.name,
            url: absolute(crumb.path),
          })),
        )}
      />
      <nav
        aria-label={t("label")}
        className={`mx-auto w-full px-4 py-1 text-[13px] leading-5 text-[#64748B] sm:py-3 ${
          narrow ? "max-w-3xl" : (width ?? "max-w-[1160px]")
        }`}
      >
        <ol className="flex flex-wrap items-center gap-x-1.5">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            return (
              <li key={crumb.path} className="flex items-center gap-x-1.5">
                {index > 0 && (
                  <ChevronRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]"
                  />
                )}
                {isLast ? (
                  <span
                    aria-current="page"
                    className="max-w-[60vw] truncate font-semibold text-[#1E293B] sm:max-w-none"
                  >
                    {crumb.name}
                  </span>
                ) : (
                  <Link
                    href={crumb.path}
                    className="inline-flex min-h-11 items-center transition-colors hover:text-[#1E293B] hover:underline sm:min-h-0"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
