import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { resolveFaq } from "@/lib/faq";
import { loadFaqContent } from "@/lib/faq-content";
import { buildPageMetadata } from "@/lib/seo";
import FAQPageContent from "./FAQPageContent";

// Static page, revalidated every minute: an admin's edit (C40) reaches every
// instance and, with the edge rule in next.config.ts, the edge within minutes,
// like the blog index (C28).
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildPageMetadata({
    locale,
    path: "/faq",
    title: t("faq"),
    description: t("faqDesc"),
  });
}

// The copy comes from loadFaqContent (the admin's saved set, else the catalog)
// and goes to the page as plain props, so no message namespace is shipped for
// it. setRequestLocale keeps the route static (C1).
export default async function FAQPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const faq = resolveFaq(await loadFaqContent(), locale);
  return <FAQPageContent faq={faq} />;
}
