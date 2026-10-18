import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import {
  SALE_RESEARCH_CACHE_TAG,
  SALE_RESEARCH_LOCALES,
  SALE_RESEARCH_SETTING_KEY,
  SALE_RESEARCH_TEXT_FIELDS,
  SALE_RESEARCH_TEXT_KEYS,
  emptySaleResearch,
  sanitizeSaleResearch,
  type SaleResearchContent,
  type SaleResearchLocale,
  type SaleResearchTextField,
} from "@/lib/sale-research";

// The admin's edits of the home page's sale-mode research section
// (src/lib/sale-research.ts). A failed read throws inside the cache, so it is
// not cached; the caller then shows the defaults.
const readStoredSaleResearch = unstable_cache(
  async (): Promise<unknown> => {
    const { data, error } = await createPublicClient()
      .from("site_settings")
      .select("value")
      .eq("key", SALE_RESEARCH_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(`[sale-research] read failed: ${error.message}`);
    return data?.value ?? null;
  },
  ["sale-research"],
  { tags: [SALE_RESEARCH_CACHE_TAG], revalidate: 600 },
);

export async function getSaleResearch(): Promise<SaleResearchContent> {
  try {
    const { content, problems } = sanitizeSaleResearch(
      await readStoredSaleResearch(),
    );
    if (problems.length > 0) {
      console.warn("[sale-research] stored fields left at default", problems);
    }
    return content;
  } catch (error) {
    console.error("[sale-research] using defaults", error);
    return emptySaleResearch();
  }
}

// Each locale's catalog text for every field, for the admin page (which cannot
// import the message files).
export const loadSaleResearchDefaults = cache(
  async (): Promise<
    Record<SaleResearchLocale, Record<SaleResearchTextField, string>>
  > => {
    const entries = await Promise.all(
      SALE_RESEARCH_LOCALES.map(async (locale) => {
        const messages = (await import(`../../messages/${locale}.json`))
          .default as { Landing?: { sale?: Record<string, string> } };
        const sale = messages.Landing?.sale ?? {};
        const texts = {} as Record<SaleResearchTextField, string>;
        for (const field of SALE_RESEARCH_TEXT_FIELDS) {
          texts[field] = sale[SALE_RESEARCH_TEXT_KEYS[field]] ?? "";
        }
        return [locale, texts] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<
      SaleResearchLocale,
      Record<SaleResearchTextField, string>
    >;
  },
);
