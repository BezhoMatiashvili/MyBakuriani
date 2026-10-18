import type { AppLocale } from "@/i18n/routing";
import type { LegalDoc } from "./types";
import { termsKa } from "./terms.ka";
import { termsEn } from "./terms.en";
import { termsRu } from "./terms.ru";
import { privacyKa } from "./privacy.ka";
import { privacyEn } from "./privacy.en";
import { privacyRu } from "./privacy.ru";
import { marketingKa } from "./marketing.ka";
import { marketingEn } from "./marketing.en";
import { marketingRu } from "./marketing.ru";

export type { LegalDoc, LegalSection, LegalSubsection } from "./types";

export const termsContent: Record<AppLocale, LegalDoc> = {
  ka: termsKa,
  en: termsEn,
  ru: termsRu,
};

export const privacyContent: Record<AppLocale, LegalDoc> = {
  ka: privacyKa,
  en: privacyEn,
  ru: privacyRu,
};

export const marketingContent: Record<AppLocale, LegalDoc> = {
  ka: marketingKa,
  en: marketingEn,
  ru: marketingRu,
};
