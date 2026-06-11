import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { privacyContent } from "@/content/legal";
import LegalDocumentView from "@/components/legal/LegalDocumentView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("privacy"),
    description: t("privacyDesc"),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  return <LegalDocumentView doc={privacyContent[locale]} />;
}
