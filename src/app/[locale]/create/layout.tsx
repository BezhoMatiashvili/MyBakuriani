import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { CREATE_NAMESPACES, pickMessages } from "@/i18n/namespaces";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireConsent } from "@/lib/auth/require-consent";
import { CreateHeader } from "@/components/layout/CreateHeader";
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
    title: t("create"),
    description: t("createDesc"),
  };
}

// Second gate, behind the middleware. The middleware deliberately lets a
// TRANSIENT auth failure through rather than falsely logging the user out
// (see src/lib/supabase/middleware.ts), so a genuinely revoked session can now
// reach this tree once. None of the /create/* category pages redirect on their
// own — they only read useAuth() on the client — so without this guard that
// relaxation would make them renderable while signed out (C8). Mirrors what
// dashboard/layout.tsx already does.
export default async function CreateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // Next's layout type check wants the raw segment string; the root layout
  // has already rejected anything that is not a configured locale.
  params: Promise<{ locale: string }>;
}) {
  const locale = (await params).locale as AppLocale;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/create");
  // Publishing a listing is an act under the Terms, so it is gated on consent
  // as well as on auth. Unlike the dashboard layout this tree did not fetch the
  // profile at all, so this adds one memoized read.
  await requireConsent();

  // The create forms' namespaces are not in the root provider (they used to be
  // shipped to every public page); a nested provider replaces the root messages
  // for this whole tree, so CREATE_NAMESPACES covers CreateHeader too (C1).
  const messages = pickMessages(
    await getMessages({ locale }),
    CREATE_NAMESPACES,
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
        <CreateHeader />
        <main className="flex-1">{children}</main>
        <footer className="py-6 text-center">
          <p className="text-[11px] font-medium text-[#94A3B8]">
            © MyBakuriani.ge Property Management Portal
          </p>
        </footer>
      </div>
    </NextIntlClientProvider>
  );
}
