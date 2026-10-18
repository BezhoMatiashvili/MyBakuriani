import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createTranslator } from "next-intl";
import type { getTranslations } from "next-intl/server";
import { guideLinks } from "@/components/seo/richLinks";
import type { AppLocale } from "@/i18n/routing";
import {
  GUIDE_CONTENT_SETTING_KEY,
  GUIDE_LOCALES,
  applyGuideOverrides,
  emptyGuideOverrides,
  flattenGuide,
  sanitizeGuideOverrides,
  type GuideLocale,
  type GuideOverrides,
  type GuideTexts,
} from "@/lib/guide-overrides";
import { createPublicClient } from "@/lib/supabase/server";

// The resort guide's copy as visitors see it (C40): the catalog's `Guide`
// namespace with the admin's edits (src/lib/guide-overrides.ts) laid over it.
// Every guide surface reads `Guide` through getGuideTranslator, never through
// getTranslations, or the admin's edits would not reach it (check-contracts C40).

export const GUIDE_CONTENT_CACHE_TAG = "guide-content";

// Rich-text tags the guide copy may use: the links guideLinks renders.
export const GUIDE_LINK_TAGS: readonly string[] = Object.keys(guideLinks);

async function loadCatalogGuide(locale: GuideLocale): Promise<unknown> {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return (messages as { Guide?: unknown }).Guide ?? {};
}

// The catalog texts of every locale, flattened ("zone.didveli.h1" -> text).
export const loadGuideDefaults = cache(
  async (): Promise<Record<GuideLocale, GuideTexts>> => {
    const entries = await Promise.all(
      GUIDE_LOCALES.map(
        async (locale) =>
          [locale, flattenGuide(await loadCatalogGuide(locale))] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<GuideLocale, GuideTexts>;
  },
);

// True when `text` formats as an ICU message with every guide tag and the
// `{date}` argument supplied, the way the pages call t(), t.rich() and
// t("checked", { date }).
export function guideTextFormats(text: string): boolean {
  let failed = false;
  const t = createTranslator({
    locale: "ka",
    messages: { check: text },
    onError: () => {
      failed = true;
    },
  });
  const tags = Object.fromEntries(
    GUIDE_LINK_TAGS.map((tag) => [tag, (chunks: string) => chunks]),
  );
  t.markup("check", { ...tags, date: "1" });
  return !failed;
}

export async function sanitizeGuideInput(input: unknown) {
  return sanitizeGuideOverrides(
    input,
    await loadGuideDefaults(),
    GUIDE_LINK_TAGS,
    guideTextFormats,
  );
}

// The stored row, cached across requests and tagged so the admin route's
// revalidateTag shows a save at once. A failed read throws, so it is not
// cached; the caller then renders the catalog text for this request.
const readStoredGuideContent = unstable_cache(
  async (): Promise<unknown> => {
    const { data, error } = await createPublicClient()
      .from("site_settings")
      .select("value")
      .eq("key", GUIDE_CONTENT_SETTING_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value ?? null;
  },
  ["guide-content"],
  { tags: [GUIDE_CONTENT_CACHE_TAG], revalidate: 600 },
);

// Re-checked on read: a stored text that no longer passes (a key gone from
// the catalog, a rule tightened) falls back to the catalog text instead of
// breaking an ISR page.
const loadGuideOverrides = cache(async (): Promise<GuideOverrides> => {
  try {
    const { overrides, problems } = await sanitizeGuideInput(
      await readStoredGuideContent(),
    );
    if (problems.length > 0) {
      console.error("[guide-content] ignored stored texts", problems);
    }
    return overrides;
  } catch (error) {
    console.error("[guide-content] read failed", error);
    return emptyGuideOverrides();
  }
});

export type GuideTranslator = Awaited<
  ReturnType<typeof getTranslations<"Guide">>
>;

// Drop-in for getTranslations({ locale, namespace: "Guide" }).
export const getGuideTranslator = cache(
  async (locale: AppLocale): Promise<GuideTranslator> => {
    const [guide, overrides] = await Promise.all([
      loadCatalogGuide(locale),
      loadGuideOverrides(),
    ]);
    return createTranslator({
      locale,
      messages: { Guide: applyGuideOverrides(guide, overrides[locale]) },
      namespace: "Guide",
    }) as unknown as GuideTranslator;
  },
);
