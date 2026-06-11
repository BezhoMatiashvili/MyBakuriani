"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  "support",
] as const;

export default function FAQPageClient() {
  const t = useTranslations("FAQ");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <ScrollReveal>
        <h1 className="text-[32px] font-black text-[#1E293B]">{t("title")}</h1>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </ScrollReveal>
      <div className="mt-10 divide-y divide-border rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        {FAQ_KEYS.map((key, i) => (
          <ScrollReveal key={key} delay={i * 0.05}>
            <div>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-[16px] font-bold text-[#1E293B] transition-colors hover:text-[#1E293B]/80"
              >
                <span>{t(`items.${key}.question`)}</span>
                <motion.span
                  animate={{ rotate: openIndex === i ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-4 shrink-0"
                >
                  <ChevronDown className="h-5 w-5 text-[#94A3B8]" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-[14px] text-[#64748B] leading-relaxed">
                      {t(`items.${key}.answer`)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
