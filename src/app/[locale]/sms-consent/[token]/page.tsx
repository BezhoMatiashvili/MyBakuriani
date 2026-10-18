import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { SMS_CONSENT_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import type { AppLocale } from "@/i18n/routing";
import { SmsConsentClient } from "./SmsConsentClient";

export const metadata: Metadata = {
  title: "SMS consent | MyBakuriani",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The root provider ships only PUBLIC_NAMESPACES; this page re-provides its own
// namespace in a nested provider (which replaces, not merges, messages - C1).
export default async function SmsConsentPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const messages = pickMessages(
    await getMessages({ locale }),
    SMS_CONSENT_NAMESPACES,
  );
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SmsConsentClient token={token} />
    </NextIntlClientProvider>
  );
}
