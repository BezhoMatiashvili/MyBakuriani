import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { privacyContent } from "@/content/legal";
import LegalDocumentView from "@/components/legal/LegalDocumentView";

// Static page: revalidate daily so the edge TTL is a day, not the default year,
// and a copy or metadata fix reaches Cloudflare without a manual purge (C40).
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildPageMetadata({
    locale,
    path: "/privacy",
    title: t("privacy"),
    description: t("privacyDesc"),
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  return <LegalDocumentView doc={privacyContent[locale]} />;
}
