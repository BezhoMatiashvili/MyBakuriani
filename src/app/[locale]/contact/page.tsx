import type { Metadata } from "next";
import { Mail, Phone, MapPin } from "lucide-react";
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
    title: t("contact"),
    description: t("contactDesc"),
  };
}

export default async function ContactPage() {
  const t = await getTranslations("ContactPage");
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-[32px] font-black text-[#1E293B]">{t("title")}</h1>
      <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
        {t("subtitle")}
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <div className="flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
            <Phone className="h-6 w-6" />
          </div>
          <h2 className="text-[13px] font-bold text-[#1E293B]">{t("phone")}</h2>
          <p className="text-[14px] text-[#64748B]">+995 555 00 00 00</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
            <Mail className="h-6 w-6" />
          </div>
          <h2 className="text-[13px] font-bold text-[#1E293B]">{t("email")}</h2>
          <p className="text-[14px] text-[#64748B]">info@mybakuriani.ge</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-white p-6 text-center shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
            <MapPin className="h-6 w-6" />
          </div>
          <h2 className="text-[13px] font-bold text-[#1E293B]">
            {t("address")}
          </h2>
          <p className="text-[14px] text-[#64748B]">{t("addressValue")}</p>
        </div>
      </div>
    </div>
  );
}
