import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
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
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/create");

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <CreateHeader />
      <main className="flex-1">{children}</main>
      <footer className="py-6 text-center">
        <p className="text-[11px] font-medium text-[#94A3B8]">
          © MyBakuriani.ge Property Management Portal
        </p>
      </footer>
    </div>
  );
}
