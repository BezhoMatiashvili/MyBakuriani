import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
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

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
              width={300}
              height={199}
              className="h-10 w-auto"
            />
          </Link>
          <LanguageSelector />
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
