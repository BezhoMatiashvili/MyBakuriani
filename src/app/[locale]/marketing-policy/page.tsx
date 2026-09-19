import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { marketingContent } from "@/content/legal";
import LegalDocumentView from "@/components/legal/LegalDocumentView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("marketingPolicy"),
    description: t("marketingPolicyDesc"),
  };
}

export default async function MarketingPolicyPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  return <LegalDocumentView doc={marketingContent[locale]} />;
}
