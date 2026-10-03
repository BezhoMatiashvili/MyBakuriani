import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { DETAIL_WIDTH, type ListingKind } from "@/components/seo/listing-kind";

// Home > category > listing, for the eight detail pages. The category label is
// the one the navbar and footer already use, so the trail reads like the site
// (C40). `path` is the listing's canonical, locale-less path.
export default async function ListingBreadcrumbs({
  locale,
  kind,
  title,
  path,
}: {
  locale: AppLocale;
  kind: ListingKind;
  title: string;
  path: string;
}) {
  const categoryLabel =
    kind === "sales"
      ? (await getTranslations({ locale, namespace: "Footer" }))("forSale")
      : (await getTranslations({ locale, namespace: "Navbar" }))(kind);

  return (
    <Breadcrumbs
      locale={locale}
      width={DETAIL_WIDTH[kind]}
      items={[
        { name: categoryLabel, path: `/${kind}` },
        { name: title, path },
      ]}
    />
  );
}
