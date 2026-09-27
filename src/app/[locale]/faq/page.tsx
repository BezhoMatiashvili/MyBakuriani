import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { FAQ_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import type { AppLocale } from "@/i18n/routing";
import FAQPageClient from "./FAQPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("faq"),
    description: t("faqDesc"),
  };
}

// FAQ is the only page that uses its namespace, so the root provider no longer
// ships it to every page; this nested provider replaces the root messages for
// the FAQ client tree. setRequestLocale keeps the route static (C1).
export default async function FAQPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = pickMessages(await getMessages({ locale }), FAQ_NAMESPACES);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FAQPageClient />
    </NextIntlClientProvider>
  );
}
