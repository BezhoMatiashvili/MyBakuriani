import { Noto_Sans_Georgian } from "next/font/google";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { PUBLIC_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import { LocaleShell } from "@/components/layout/LocaleShell";

const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-sans",
  display: "swap",
});

// Pre-render all locales at build time so routes are static (not dynamic).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Must run before any next-intl API (getMessages below) to keep static rendering.
  setRequestLocale(locale);

  // Ship only the namespaces that public-route client components use. Dashboard
  // routes re-provide the full bundle in their own nested provider. Server
  // components (getTranslations) are unaffected — they read the request config,
  // not this provider. Verified by scripts/i18n-scope.mjs (prebuild guard).
  const messages = pickMessages(await getMessages(), PUBLIC_NAMESPACES);

  return (
    <html lang={locale} className={cn("font-sans", notoSansGeorgian.variable)}>
      <body className="flex min-h-dvh flex-col bg-white text-[#1E293B] antialiased">
        <NextIntlClientProvider messages={messages}>
          <LocaleShell>{children}</LocaleShell>
        </NextIntlClientProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
