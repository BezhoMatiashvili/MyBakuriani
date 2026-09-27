import type { Metadata } from "next";
import Image from "next/image";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { AUTH_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import { Link } from "@/i18n/navigation";
import { LanguageSelector } from "@/components/LanguageSelector";
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
    title: t("auth"),
    description: t("authDesc"),
  };
}

// Rendered per request, as these pages always were: they used to opt in
// implicitly (the Link below read the request locale from headers() before the
// root layout had set it). A static prerender would bail the login/register
// forms out to client rendering, because they read search params.
export const dynamic = "force-dynamic";

// The auth pages' namespaces are not in the root provider (they were shipped to
// every public page); this nested provider re-provides them, plus everything
// else rendered under this layout (C1).
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Next's layout type check wants the raw segment string; the root layout
  // has already rejected anything that is not a configured locale.
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as AppLocale;
  const messages = pickMessages(await getMessages({ locale }), AUTH_NAMESPACES);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-dvh flex-col bg-white">
        <header className="w-full border-b border-[#E2E8F0] bg-white">
          <div className="mx-auto flex h-[72px] max-w-[1160px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              aria-label="MyBakuriani"
              className="flex shrink-0 items-center"
            >
              <Image
                src="/logo.png"
                alt="MyBakuriani"
                width={124}
                height={50}
                className="h-10 w-auto"
              />
            </Link>
            <LanguageSelector />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </NextIntlClientProvider>
  );
}
