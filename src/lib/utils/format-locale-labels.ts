// Locale label tables for src/lib/utils/format.ts. Kept in a separate
// data module (like date-fns locale files) so format.ts stays free of
// hardcoded UI strings while remaining a plain, hook-free utility.

export type FormatLocale = "ka" | "en" | "ru";

export const NIGHT_LABELS: Record<FormatLocale, string> = {
  ka: "ღამე",
  en: "night",
  ru: "ночь",
};

export interface RelativeLabels {
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  daysAgo: (n: number) => string;
  monthsAgo: (n: number) => string;
}

export const RELATIVE_LABELS: Record<FormatLocale, RelativeLabels> = {
  ka: {
    justNow: "ახლახან",
    minutesAgo: (n) => `${n} წთ წინ`,
    hoursAgo: (n) => `${n} სთ წინ`,
    daysAgo: (n) => `${n} დღის წინ`,
    monthsAgo: (n) => `${n} თვის წინ`,
  },
  en: {
    justNow: "just now",
    minutesAgo: (n) => `${n} min ago`,
    hoursAgo: (n) => `${n} h ago`,
    daysAgo: (n) => (n === 1 ? "1 day ago" : `${n} days ago`),
    monthsAgo: (n) => (n === 1 ? "1 month ago" : `${n} months ago`),
  },
  ru: {
    justNow: "только что",
    minutesAgo: (n) => `${n} мин назад`,
    hoursAgo: (n) => `${n} ч назад`,
    daysAgo: (n) => `${n} дн. назад`,
    monthsAgo: (n) => `${n} мес. назад`,
  },
};
