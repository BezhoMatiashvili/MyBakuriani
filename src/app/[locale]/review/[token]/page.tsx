import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PauseCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "შეფასებები დროებით შეჩერებულია | MyBakuriani",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Guest reviews are retired (20261024130000) and stay closed (owner's technical task
// 2026-10-25, SMS-15): a review link already sent opens this notice, never a form.
export default async function ReviewLinkPaused({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ReviewPaused" });
  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] sm:p-8">
        <PauseCircle className="mx-auto size-12 text-[#94A3B8]" />
        <h1 className="mt-4 text-xl font-black text-[#0F172A]">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">{t("body")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#2563EB] px-6 text-sm font-black text-white"
        >
          {t("home")}
        </Link>
      </section>
    </main>
  );
}
