// Shared types + helpers for the admin-managed landing "status cards"
// (weather / ski lifts / road / cameras). Persisted as a single JSON document
// in site_settings (key = "status_cards"); see src/lib/status-cards/server.ts.

export type StatusLocale = "ka" | "en" | "ru";

export type LocalizedText = {
  ka: string;
  en?: string;
  ru?: string;
};

// Drives the colored dot next to an expanded child item.
export type StatusKind = "ok" | "warn" | "closed" | "none";
export const STATUS_KINDS: StatusKind[] = ["ok", "warn", "closed", "none"];

// Whitelisted icons — mapped to lucide components in ./icons.tsx.
export type StatusIcon =
  | "none"
  | "thermometer"
  | "cloud"
  | "snowflake"
  | "mountain"
  | "cableCar"
  | "car"
  | "route"
  | "video"
  | "camera"
  // Weather-condition icons — auto-assigned to the live weather card from
  // WeatherAPI conditions (see src/lib/weather/weatherapi.ts).
  | "sun"
  | "cloudSun"
  | "cloudRain"
  | "cloudSnow"
  | "cloudFog"
  | "cloudLightning";
export const STATUS_ICONS: StatusIcon[] = [
  "none",
  "thermometer",
  "cloud",
  "snowflake",
  "mountain",
  "cableCar",
  "car",
  "route",
  "video",
  "camera",
  "sun",
  "cloudSun",
  "cloudRain",
  "cloudSnow",
  "cloudFog",
  "cloudLightning",
];

export type StatusCardItem = {
  id: string;
  label: LocalizedText;
  value?: LocalizedText | null;
  status: StatusKind;
  url?: string | null;
};

export type StatusCard = {
  id: string;
  icon: StatusIcon;
  label: LocalizedText;
  value: LocalizedText;
  // Small caption rendered under `value` (e.g. the road card's drive-time
  // estimate). Optional — most cards don't set it.
  subValue?: LocalizedText | null;
  redDot: boolean;
  expandable: boolean;
  active: boolean;
  items: StatusCardItem[];
};

// Caps enforced by the admin API to keep the document sane.
export const MAX_CARDS = 16;
export const MAX_ITEMS_PER_CARD = 24;

export function isStatusIcon(value: unknown): value is StatusIcon {
  return (
    typeof value === "string" && STATUS_ICONS.includes(value as StatusIcon)
  );
}

export function isStatusKind(value: unknown): value is StatusKind {
  return (
    typeof value === "string" && STATUS_KINDS.includes(value as StatusKind)
  );
}

// Returns the text for the active locale, falling back to Georgian when a
// translation is blank (the user-chosen fallback rule).
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: string,
): string {
  if (!text) return "";
  const key = (
    locale === "en" || locale === "ru" ? locale : "ka"
  ) as StatusLocale;
  return (text[key] && text[key]!.trim()) || text.ka || "";
}

// Cards whose closed-card face should preview its item names (e.g. "დიდველი,
// კოხტა…") instead of staying blank until expanded. Deliberately excludes
// "road" (already sets its own live drive-time subValue via withLiveRoad) and
// "weather" (has no items).
const ITEM_SUBTITLE_CARD_IDS = new Set(["lifts", "cameras"]);
const ITEM_SUBTITLE_MAX_NAMES = 2;
const ITEM_SUBTITLE_LOCALES: StatusLocale[] = ["ka", "en", "ru"];

function buildItemNamesSubtitle(items: StatusCardItem[]): LocalizedText {
  const subtitle: LocalizedText = { ka: "" };
  for (const locale of ITEM_SUBTITLE_LOCALES) {
    const names = items
      .map((item) => pickLocalized(item.label, locale))
      .filter(Boolean);
    const shown = names.slice(0, ITEM_SUBTITLE_MAX_NAMES).join(", ");
    subtitle[locale] =
      names.length > ITEM_SUBTITLE_MAX_NAMES ? `${shown}…` : shown;
  }
  return subtitle;
}

// Fills `subValue` on the lifts/cameras cards with a truncated list of their
// item names, so the collapsed card face previews what's inside instead of
// requiring an expand click to see anything beyond the count.
export function withItemNameSubtitles(cards: StatusCard[]): StatusCard[] {
  return cards.map((card) => {
    if (
      !ITEM_SUBTITLE_CARD_IDS.has(card.id) ||
      card.items.length === 0 ||
      card.subValue
    ) {
      return card;
    }
    return { ...card, subValue: buildItemNamesSubtitle(card.items) };
  });
}

// Fallback shown when the DB row is missing/empty — mirrors FALLBACK_ZONES.
// Kept in sync with the seed migration so the public site never renders blank.
export const DEFAULT_STATUS_CARDS: StatusCard[] = [
  {
    id: "weather",
    icon: "none",
    label: { ka: "ამინდი", en: "Weather", ru: "Погода" },
    value: { ka: "-4°C", en: "-4°C", ru: "-4°C" },
    redDot: false,
    expandable: false,
    active: true,
    items: [],
  },
  {
    id: "lifts",
    icon: "mountain",
    label: { ka: "საბაგიროები", en: "Ski lifts", ru: "Подъёмники" },
    value: { ka: "3/5 ღია", en: "3/5 open", ru: "3/5 открыты" },
    redDot: false,
    expandable: true,
    active: true,
    items: [
      {
        id: "lift-kokhta-1",
        label: { ka: "კოხტა 1", en: "Kokhta 1", ru: "Кохта 1" },
        value: { ka: "ღია", en: "Open", ru: "Открыт" },
        status: "ok",
        url: null,
      },
      {
        id: "lift-kokhta-2",
        label: { ka: "კოხტა 2", en: "Kokhta 2", ru: "Кохта 2" },
        value: { ka: "ღია", en: "Open", ru: "Открыт" },
        status: "ok",
        url: null,
      },
      {
        id: "lift-didveli",
        label: { ka: "დიდველი", en: "Didveli", ru: "Дидвели" },
        value: { ka: "ღია", en: "Open", ru: "Открыт" },
        status: "ok",
        url: null,
      },
      {
        id: "lift-tatra",
        label: { ka: "ტატრა", en: "Tatra", ru: "Татра" },
        value: { ka: "დაკეტილი", en: "Closed", ru: "Закрыт" },
        status: "closed",
        url: null,
      },
      {
        id: "lift-mitarbi",
        label: { ka: "მიტარბი", en: "Mitarbi", ru: "Митарби" },
        value: { ka: "დაკეტილი", en: "Closed", ru: "Закрыт" },
        status: "closed",
        url: null,
      },
    ],
  },
  {
    id: "road",
    icon: "car",
    label: {
      ka: "გზა თბილისიდან",
      en: "Road from Tbilisi",
      ru: "Дорога из Тбилиси",
    },
    value: { ka: "თავისუფალი", en: "Clear", ru: "Свободна" },
    subValue: { ka: "~3სთ", en: "~3h", ru: "~3ч" },
    redDot: false,
    expandable: false,
    active: true,
    items: [],
  },
  {
    id: "cameras",
    icon: "video",
    label: { ka: "კამერები", en: "Cameras", ru: "Камеры" },
    value: { ka: "2 ლოკაცია", en: "2 locations", ru: "2 локации" },
    redDot: true,
    expandable: true,
    active: true,
    items: [
      {
        id: "cam-center",
        label: {
          ka: "ცენტრალური მოედანი",
          en: "Central Square",
          ru: "Центральная площадь",
        },
        value: null,
        status: "none",
        url: null,
      },
      {
        id: "cam-kokhta",
        label: { ka: "კოხტა გორა", en: "Kokhta Gora", ru: "Кохта Гора" },
        value: null,
        status: "none",
        url: null,
      },
    ],
  },
];
