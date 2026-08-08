"use client";

import { useTranslations } from "next-intl";
import {
  HOSTING_LANGS,
  optionKeyFor,
} from "@/lib/constants/listing-options";

interface HostLanguagesProps {
  value: unknown;
}

const HOSTING_LANGUAGE_KEYS = new Set(HOSTING_LANGS.map((item) => item.key));

export default function HostLanguages({ value }: HostLanguagesProps) {
  const tDetail = useTranslations("PropertyDetail");
  const tOptions = useTranslations("ListingOptions");
  const languages = Array.isArray(value)
    ? Array.from(
        new Set(
          value.flatMap((item) => {
            if (typeof item !== "string") return [];
            const key = optionKeyFor("hostingLangs", item.trim());
            return key && HOSTING_LANGUAGE_KEYS.has(key) ? [key] : [];
          }),
        ),
      )
    : [];

  if (languages.length === 0) return null;

  return (
    <section data-testid="host-languages">
      <h2 className="mb-3 text-[20px] font-black leading-[30px] text-[#0F172A]">
        {tDetail("hostLanguages")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {languages.map((language) => (
          <span
            key={language}
            data-host-language={language}
            className="rounded-[14px] border border-[#DBEAFE] bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB]"
          >
            {tOptions(`hostingLangs.${language}`)}
          </span>
        ))}
      </div>
    </section>
  );
}
