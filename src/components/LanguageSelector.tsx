"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSelector() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LanguageSelector");

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
      {routing.locales.map((loc) => {
        const isActive = locale === loc;
        return (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            className={`rounded-md px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
              isActive
                ? "bg-white text-[#1E293B] shadow-sm"
                : "text-[#64748B] hover:text-[#1E293B]"
            }`}
          >
            {t(loc)}
          </button>
        );
      })}
    </div>
  );
}
