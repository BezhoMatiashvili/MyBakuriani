import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { SMS_STOP_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import type { AppLocale } from "@/i18n/routing";
import { SmsStopClient } from "./SmsStopClient";

export const metadata: Metadata = {
  title: "შეთავაზებებზე უარი | MyBakuriani",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The win-back opt-out link (C18). Like /sms-consent, it re-provides its own namespace in
// a nested provider (which replaces, not merges, messages - C1).
export default async function SmsStopPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const messages = pickMessages(
    await getMessages({ locale }),
    SMS_STOP_NAMESPACES,
  );
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SmsStopClient token={token} />
    </NextIntlClientProvider>
  );
}
