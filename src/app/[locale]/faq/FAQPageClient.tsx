"use client";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/shared/ScrollReveal";

const FAQ_KEYS = [
  "booking",
  "payment",
  "verifiedOwner",
  "cancellation",
  "becomeOwner",
  "services",
  "smartMatch",
  "responsibility",
  "availability",
  "support",
] as const;

export default function FAQPageClient() {
  const t = useTranslations("FAQ");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* No entrance fade: the h1 is the LCP element (C40). */}
      <div>
        <h1 className="text-[32px] font-black text-[#1E293B]">{t("title")}</h1>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </div>
      <div className="mt-10 divide-y divide-border rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        {FAQ_KEYS.map((key, i) => (
          <ScrollReveal key={key} delay={i * 0.05}>
            {/* Native <details>: collapsed for people, but every answer is in
                the HTML for search engines (C40). */}
            <details className="group">
              <summary className="flex min-h-11 w-full cursor-pointer list-none items-center justify-between px-6 py-5 text-left text-[16px] font-bold text-[#1E293B] transition-colors hover:text-[#1E293B]/80 [&::-webkit-details-marker]:hidden">
                <span>{t(`items.${key}.question`)}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="ml-4 h-5 w-5 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="whitespace-pre-line px-6 pb-5 text-[14px] leading-relaxed text-[#64748B]">
                {t(`items.${key}.answer`)}
              </p>
            </details>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
