import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  FAQ_CONTENT_SETTING_KEY,
  FAQ_LOCALES,
  faqFromCatalog,
  sanitizeFaqContent,
  type FaqContent,
  type FaqLocale,
} from "@/lib/faq";
import { createPublicClient } from "@/lib/supabase/server";

// The /faq copy as visitors see it (C40): the admin's saved set
// (src/lib/faq.ts) when there is a valid one, otherwise the catalog's `FAQ`
// namespace. /faq reads it only through loadFaqContent.

export const FAQ_CONTENT_CACHE_TAG = "faq-content";

async function loadCatalogFaq(locale: FaqLocale): Promise<unknown> {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return (messages as { FAQ?: unknown }).FAQ ?? {};
}

// The catalog text as content: what the page shows until the first save and
// what the admin page offers as "original".
export const loadFaqDefaults = cache(async (): Promise<FaqContent> => {
  const entries = await Promise.all(
    FAQ_LOCALES.map(
      async (locale) => [locale, await loadCatalogFaq(locale)] as const,
    ),
  );
  return faqFromCatalog(
    Object.fromEntries(entries) as Record<FaqLocale, unknown>,
  );
});

// The stored row, cached across requests and tagged so the admin route's
// revalidateTag shows a save at once on that instance; the 60 s lifetime bounds
// the others. A failed read throws, so it is not cached.
const readStoredFaqContent = unstable_cache(
  async (): Promise<unknown> => {
    const { data, error } = await createPublicClient()
      .from("site_settings")
      .select("value")
      .eq("key", FAQ_CONTENT_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value ?? null;
  },
  ["faq-content"],
  { tags: [FAQ_CONTENT_CACHE_TAG], revalidate: 60 },
);

// Re-checked on read: a stored set that no longer passes falls back to the
// catalog text instead of breaking an ISR page.
export const loadFaqContent = cache(async (): Promise<FaqContent> => {
  try {
    const stored = await readStoredFaqContent();
    if (stored !== null) {
      const { content, problems } = sanitizeFaqContent(stored);
      if (problems.length === 0) return content;
      console.error("[faq-content] ignored the stored set", problems);
    }
  } catch (error) {
    console.error("[faq-content] read failed", error);
  }
  return loadFaqDefaults();
});
