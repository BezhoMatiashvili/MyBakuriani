// The Bakuriani resort guide (C40): which pages exist, which zones they cover,
// and what each page's copy is sourced from. Pure module (no "@/" imports) so
// the pages, the sitemap and scripts/unit tests read one list.
export const GUIDE_BASE_PATH = "/bakuriani";

// The four seeded zones (zones table / FALLBACK_ZONES). The guide carries
// hand-written copy for exactly these, so the list is fixed here instead of
// being read from the database; a zone added in the admin panel gets no guide
// page until its copy is written.
export const GUIDE_ZONE_SLUGS = [
  "didveli",
  "centri",
  "kokhta",
  "25ianebi",
] as const;
export type GuideZoneSlug = (typeof GUIDE_ZONE_SLUGS)[number];

export function isGuideZoneSlug(value: string): value is GuideZoneSlug {
  return (GUIDE_ZONE_SLUGS as readonly string[]).includes(value);
}

// Locale-less paths of every guide page, in sitemap order.
export const GUIDE_PATHS: readonly string[] = [
  GUIDE_BASE_PATH,
  `${GUIDE_BASE_PATH}/getting-there`,
  `${GUIDE_BASE_PATH}/ski-lifts`,
  ...GUIDE_ZONE_SLUGS.map((slug) => `${GUIDE_BASE_PATH}/${slug}`),
];

// ISO date the guide's facts were last checked against GUIDE_SOURCES. Printed on
// every guide page ("Facts checked"); bump it only after re-reading the sources.
export const GUIDE_FACTS_CHECKED = "2026-10-03";

export interface GuideSource {
  title: string;
  url: string;
}

export const GUIDE_SOURCES = {
  mta: {
    title: "Mountain Trails Agency (mta.ski)",
    url: "https://mta.ski",
  },
  wikipedia: {
    title: "Wikipedia: Bakuriani",
    url: "https://en.wikipedia.org/wiki/Bakuriani",
  },
  wikipediaRailway: {
    title: "Wikipedia: Borjomi–Bakuriani railway",
    url: "https://en.wikipedia.org/wiki/Borjomi%E2%80%93Bakuriani_railway",
  },
  georgiaTravel: {
    title: "Georgian National Tourism Administration: Bakuriani",
    url: "https://georgia.travel/resorts/bakuriani",
  },
  georgiaTodayOpening: {
    title:
      "Georgia Today: Bakuriani's Kokhta slopes to launch on December 20 (18 December 2025)",
    url: "https://georgiatoday.ge/georgia-opens-winter-ski-season-bakurianis-kokhta-slopes-to-launch-on-december-20/",
  },
  georgiaTodayRailway: {
    title:
      "Georgia Today: Government announces full restoration of the Borjomi–Bakuriani railway",
    url: "https://georgiatoday.ge/govt-announces-full-restoration-of-borjomi-bakuriani-railway-expansion-of-national-rail-network/",
  },
  wanderLush: {
    title: "Wander-Lush: 10 things to know before you visit Bakuriani",
    url: "https://wander-lush.org/visit-bakuriani-travel-tips/",
  },
} as const satisfies Record<string, GuideSource>;
export type GuideSourceId = keyof typeof GUIDE_SOURCES;

// Which sources stand behind which page. A page lists only what its own copy
// uses, so a reader can trace a figure to where it came from.
export const GUIDE_PAGE_SOURCES = {
  hub: [
    "wikipedia",
    "georgiaTravel",
    "georgiaTodayOpening",
    "wanderLush",
    "wikipediaRailway",
    "georgiaTodayRailway",
    "mta",
  ],
  "getting-there": [
    "georgiaTravel",
    "wanderLush",
    "wikipediaRailway",
    "georgiaTodayRailway",
  ],
  "ski-lifts": ["mta", "georgiaTodayOpening", "wikipedia", "wanderLush"],
  didveli: ["wikipedia", "wanderLush", "georgiaTodayOpening"],
  centri: ["georgiaTravel"],
  kokhta: ["wikipedia", "wanderLush", "georgiaTodayOpening"],
  "25ianebi": ["wanderLush"],
} as const satisfies Record<string, readonly GuideSourceId[]>;
export type GuidePageKey = keyof typeof GUIDE_PAGE_SOURCES;
