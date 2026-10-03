import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { buildPageMetadata } from "@/lib/seo";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
} from "@/lib/site-contact";

// Static page: revalidate daily so the edge TTL is a day, not the default year,
// and a copy or metadata fix reaches Cloudflare without a manual purge (C40).
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildPageMetadata({
    locale,
    path: "/contact",
    title: t("contact"),
    description: t("contactDesc"),
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  // Explicit { locale }: the bare string form resolves locale via headers(),
  // which silently flips this whole page from static to per-request dynamic.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ContactPage" });
  const tFooter = await getTranslations({ locale, namespace: "Footer" });
  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[{ name: tFooter("contact"), path: "/contact" }]}
      />
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-4 sm:pb-16 sm:pt-6">
        <h1 className="text-[32px] font-black text-[#1E293B]">{t("title")}</h1>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {t("subtitle")}
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
              <Phone className="h-6 w-6" />
            </div>
            <h2 className="text-[13px] font-bold text-[#1E293B]">
              {t("phone")}
            </h2>
            <a
              href={`tel:${CONTACT_PHONE_E164}`}
              className="text-[14px] text-[#64748B] hover:underline"
            >
              {CONTACT_PHONE_DISPLAY}
            </a>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
              <Mail className="h-6 w-6" />
            </div>
            <h2 className="text-[13px] font-bold text-[#1E293B]">
              {t("email")}
            </h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[14px] text-[#64748B] hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
