// The home page's sale-mode research section ("2024 Q3 კვლევა" / "რატომ არის
// ბაკურიანი საუკეთესო ინვესტიცია?": text, two figures, a donut chart), editable
// at /dashboard/admin/sale-research (owner's PDF "გასასწორებელი2.pdf",
// 2026-10-06). site_settings key `sale_research` stores only what the admin
// changed; an empty field shows that locale's catalog text (`Landing.sale.*`)
// or the built-in figure below. Pure (no `@/` imports) so
// scripts/unit/sale-research.test.mjs can import it.

export const SALE_RESEARCH_SETTING_KEY = "sale_research";
export const SALE_RESEARCH_CACHE_TAG = "sale-research";

export const SALE_RESEARCH_LOCALES = ["ka", "en", "ru"] as const;
export type SaleResearchLocale = (typeof SALE_RESEARCH_LOCALES)[number];

// Each text field and the `Landing.sale.*` key that holds its default.
export const SALE_RESEARCH_TEXT_KEYS = {
  eyebrow: "researchEyebrow",
  title: "whyInvest",
  body: "researchBody",
  roiLabel: "avgRoi",
  entryLabel: "minInitial",
  chartTitle: "supplyStructure",
  smallLegend: "smallApartmentsLegend",
  otherLegend: "otherFormatsLegend",
} as const;
export type SaleResearchTextField = keyof typeof SALE_RESEARCH_TEXT_KEYS;
export type SaleResearchCatalogKey =
  (typeof SALE_RESEARCH_TEXT_KEYS)[SaleResearchTextField];
export const SALE_RESEARCH_TEXT_FIELDS = Object.keys(
  SALE_RESEARCH_TEXT_KEYS,
) as SaleResearchTextField[];

export const SALE_RESEARCH_TEXT_LIMITS: Record<SaleResearchTextField, number> =
  {
    eyebrow: 60,
    title: 120,
    body: 800,
    roiLabel: 40,
    entryLabel: 40,
    chartTitle: 80,
    smallLegend: 60,
    otherLegend: 60,
  };

// The figures the section showed before it was editable. They are the same in
// every language.
export const SALE_RESEARCH_DEFAULT_VALUES = {
  roiValue: "10-15%",
  entryValue: "<$1,000",
  smallShare: 72,
} as const;
export const SALE_RESEARCH_VALUE_MAX = 20;

export type SaleResearchValues = {
  roiValue?: string;
  entryValue?: string;
  // Percent of the donut drawn as small apartments; the rest is 100 minus it.
  smallShare?: number;
};

export type SaleResearchContent = {
  texts: Record<
    SaleResearchLocale,
    Partial<Record<SaleResearchTextField, string>>
  >;
  values: SaleResearchValues;
};

export type SaleResearchProblem = {
  field: string;
  locale?: string;
  problem:
    | "unknown_locale"
    | "unknown_field"
    | "not_text"
    | "too_long"
    | "invalid_share";
};

export type ResolvedSaleResearch = Record<SaleResearchTextField, string> & {
  roiValue: string;
  entryValue: string;
  smallShare: number;
};

export function emptySaleResearch(): SaleResearchContent {
  return { texts: { ka: {}, en: {}, ru: {} }, values: {} };
}

// Every field renders inside one element, so line breaks collapse too.
export function normalizeSaleResearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocale(value: string): value is SaleResearchLocale {
  return (SALE_RESEARCH_LOCALES as readonly string[]).includes(value);
}

function isTextField(value: string): value is SaleResearchTextField {
  return Object.hasOwn(SALE_RESEARCH_TEXT_KEYS, value);
}

// Turns submitted or stored input into clean content. Empty texts and figures
// are dropped (the default shows); `problems` lists what was refused: the
// admin route answers 400 with it, the page reader just leaves those fields
// at their defaults.
export function sanitizeSaleResearch(input: unknown): {
  content: SaleResearchContent;
  problems: SaleResearchProblem[];
} {
  const content = emptySaleResearch();
  const problems: SaleResearchProblem[] = [];
  if (!isRecord(input)) return { content, problems };

  for (const key of Object.keys(input)) {
    if (key !== "texts" && key !== "values") {
      problems.push({ field: key, problem: "unknown_field" });
    }
  }

  const texts = isRecord(input.texts) ? input.texts : {};
  for (const [locale, fields] of Object.entries(texts)) {
    if (!isLocale(locale)) {
      problems.push({ field: "texts", locale, problem: "unknown_locale" });
      continue;
    }
    if (!isRecord(fields)) continue;
    for (const [field, raw] of Object.entries(fields)) {
      if (!isTextField(field)) {
        problems.push({ field, locale, problem: "unknown_field" });
        continue;
      }
      if (raw == null) continue;
      if (typeof raw !== "string") {
        problems.push({ field, locale, problem: "not_text" });
        continue;
      }
      const text = normalizeSaleResearchText(raw);
      if (!text) continue;
      if (text.length > SALE_RESEARCH_TEXT_LIMITS[field]) {
        problems.push({ field, locale, problem: "too_long" });
        continue;
      }
      content.texts[locale][field] = text;
    }
  }

  const values = isRecord(input.values) ? input.values : {};
  for (const [field, raw] of Object.entries(values)) {
    if (field === "roiValue" || field === "entryValue") {
      if (raw == null) continue;
      if (typeof raw !== "string") {
        problems.push({ field, problem: "not_text" });
        continue;
      }
      const text = normalizeSaleResearchText(raw);
      if (!text) continue;
      if (text.length > SALE_RESEARCH_VALUE_MAX) {
        problems.push({ field, problem: "too_long" });
        continue;
      }
      content.values[field] = text;
    } else if (field === "smallShare") {
      if (raw == null || raw === "") continue;
      const share = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (
        typeof share !== "number" ||
        !Number.isFinite(share) ||
        share < 0 ||
        share > 100
      ) {
        problems.push({ field, problem: "invalid_share" });
        continue;
      }
      content.values.smallShare = Math.round(share * 10) / 10;
    } else {
      problems.push({ field, problem: "unknown_field" });
    }
  }

  return { content, problems };
}

// What the section shows in `locale`: the admin's text where there is one,
// else that locale's catalog text (`catalog` maps a `Landing.sale.*` key to
// it), and the admin's figures, else the built-in ones.
export function resolveSaleResearch(
  content: SaleResearchContent | null | undefined,
  locale: string,
  catalog: (key: SaleResearchCatalogKey) => string,
): ResolvedSaleResearch {
  const own = isLocale(locale) ? content?.texts?.[locale] : undefined;
  const texts = {} as Record<SaleResearchTextField, string>;
  for (const field of SALE_RESEARCH_TEXT_FIELDS) {
    texts[field] = own?.[field] || catalog(SALE_RESEARCH_TEXT_KEYS[field]);
  }
  const values = content?.values ?? {};
  return {
    ...texts,
    roiValue: values.roiValue || SALE_RESEARCH_DEFAULT_VALUES.roiValue,
    entryValue: values.entryValue || SALE_RESEARCH_DEFAULT_VALUES.entryValue,
    smallShare: values.smallShare ?? SALE_RESEARCH_DEFAULT_VALUES.smallShare,
  };
}
