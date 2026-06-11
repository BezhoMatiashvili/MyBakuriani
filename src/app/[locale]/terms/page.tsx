import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("terms"),
    description: t("termsDesc"),
  };
}

const SECTION_KEYS = ["general", "registration", "booking", "payment"] as const;

export default async function TermsPage() {
  const t = await getTranslations("TermsPage");
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-[32px] font-black text-[#1E293B]">{t("title")}</h1>
      <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
        {t("lastUpdated")}
      </p>
      <article className="prose prose-sm mt-10 max-w-none space-y-8 text-[#1E293B]">
        {SECTION_KEYS.map((key) => (
          <section key={key}>
            <h2 className="text-[20px] font-black text-[#1E293B]">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="mt-2 text-[15px] leading-[24px] text-[#475569]">
              {t(`sections.${key}.body`)}
            </p>
          </section>
        ))}
      </article>
    </div>
  );
}
