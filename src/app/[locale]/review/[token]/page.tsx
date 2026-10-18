import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { MANUAL_REVIEW_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import type { AppLocale } from "@/i18n/routing";
import { ManualReviewClient } from "./ManualReviewClient";

// The root provider ships only PUBLIC_NAMESPACES; this page re-provides its own
// namespace in a nested provider (which replaces, not merges, messages - C1).
export default async function ManualReviewPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const messages = pickMessages(
    await getMessages({ locale }),
    MANUAL_REVIEW_NAMESPACES,
  );
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ManualReviewClient token={token} />
    </NextIntlClientProvider>
  );
}
