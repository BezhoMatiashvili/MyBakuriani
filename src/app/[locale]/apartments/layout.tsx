import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";

// The locale must be passed explicitly. getTranslations("Metadata") resolves the
// locale by reading headers(), which throws (500) in this static/ISR render when
// the URL carries an invalid locale segment — e.g. a crawler hitting /ads.txt.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("apartments"),
    description: t("apartmentsDesc"),
  };
}

export default function ApartmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
