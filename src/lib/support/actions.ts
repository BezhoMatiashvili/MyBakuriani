// The support assistant's buttons (C43). The answer model may only name an
// id from this list plus typed params; the link itself is built here from
// validated params, so a model (or text injected into its prompt) can never
// hand the browser a URL. Every button opens a page or a form, at most
// prefilled: the user makes the final press on the site's own button.
//
// Pure, like plan.ts: no runtime imports (only `import type`), because the
// unit tests load this file directly with Node's type stripping.

import type {
  ActionParamKey,
  ActionParams,
  SupportActionRef,
  SupportCabinet,
} from "./plan";

// Deep-link params read by the pages these buttons open. Must stay equal to
// src/lib/signup-links.ts (C41) and to the readers C43 checks.
export const SMART_MATCH_PARAM = "smartMatch";
export const SMART_MATCH_VALUE = "new";
export const SMART_MATCH_PREFILL = {
  zone: "zone",
  checkIn: "check_in",
  checkOut: "check_out",
  guests: "guests",
  budgetMin: "budget_min",
  budgetMax: "budget_max",
} as const;
export const TOPUP_PARAM = "topup";
/** The top-up value that opens the window without an amount. */
export const TOPUP_OPEN = "open";
export const MEMBERSHIP_PARAM = "membership";

// = MAX_CARD_TOPUP_TETRI / 100 (src/lib/payments/keepz/amount.ts, C32).
export const MAX_TOPUP_GEL = 2000;
const MAX_MONEY = 100_000;
// A property for sale can cost millions; a stay or a budget per night cannot.
const MAX_SALE_PRICE = 50_000_000;
const MAX_GUESTS = 30;
const MAX_ROOMS = 20;
const MAX_DAYS_AHEAD = 548;
const MAX_QUERY = 60;

// The property types a search button may filter by (C13).
export const SEARCH_PROPERTY_TYPES = [
  "apartment",
  "cottage",
  "hotel",
  "studio",
  "villa",
  "land",
] as const;
export const VERIFICATION_TABS = ["listings", "changes", "ownership"] as const;
export const BROWSE_CATEGORIES = [
  "apartments",
  "hotels",
  "sales",
  "food",
  "services",
  "entertainment",
  "transport",
  "employment",
] as const;
export const CREATE_KINDS = [
  "rental",
  "sale",
  "food",
  "service",
  "transport",
  "entertainment",
  "employment",
] as const;

export type ActionContext = {
  cabinet: SupportCabinet;
  signedIn: boolean;
  /** Today in Tbilisi, YYYY-MM-DD: dates before it are dropped. */
  today: string;
  /** Active zones' Georgian names (zones.name_ka). */
  zones: readonly string[];
  /** The site's own phone (E.164) and e-mail, for the contact buttons. */
  contact?: { phone: string; email: string };
};

type Where = "everywhere" | "visitors" | "members" | readonly SupportCabinet[];

type ActionDef = {
  where: Where;
  /** Needs an account: a visitor gets a sign-in link that continues there. */
  account?: boolean;
  params?: readonly ActionParamKey[];
  /** One line for the model's button catalogue. */
  prompt: string;
  /** The locale-free link (path and query), or null if none can be made. */
  href: (params: ActionParams, ctx: ActionContext) => string | null;
};

const PUBLIC: readonly SupportCabinet[] = ["public", "auth", "guest"];
const BALANCE: readonly SupportCabinet[] = [
  "renter",
  "seller",
  "food",
  "entertainment",
  "transport",
  "employment",
  "services",
];
const ORDERS: readonly SupportCabinet[] = [
  "entertainment",
  "transport",
  "employment",
  "services",
];
const SETTINGS: Partial<Record<SupportCabinet, string>> = {
  guest: "/dashboard/guest/profile",
  renter: "/dashboard/renter/profile",
  seller: "/dashboard/seller/settings",
  cleaner: "/dashboard/cleaner/parameters",
  food: "/dashboard/food/parameters",
  entertainment: "/dashboard/entertainment/parameters",
  transport: "/dashboard/transport/parameters",
  employment: "/dashboard/employment/parameters",
  services: "/dashboard/services/parameters",
};
const LISTINGS: Partial<Record<SupportCabinet, string>> = {
  renter: "/dashboard/renter/listings",
  seller: "/dashboard/seller/listings",
  food: "/dashboard/food",
  entertainment: "/dashboard/entertainment",
  transport: "/dashboard/transport",
  employment: "/dashboard/employment",
  services: "/dashboard/services",
};

function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const num = (value: unknown) => (typeof value === "number" ? value : undefined);

const ACTIONS = {
  contact_page: {
    where: "everywhere",
    prompt: "the contact page (the team's phone and e-mail)",
    href: () => "/contact",
  },
  call_support: {
    where: "everywhere",
    prompt: "call the MyBakuriani team",
    href: (_p, ctx) => (ctx.contact ? `tel:${ctx.contact.phone}` : null),
  },
  email_support: {
    where: "everywhere",
    prompt: "write an e-mail to the MyBakuriani team",
    href: (_p, ctx) => (ctx.contact ? `mailto:${ctx.contact.email}` : null),
  },
  faq: {
    where: "everywhere",
    prompt: "the questions-and-answers page /faq",
    href: () => "/faq",
  },
  pricing: {
    where: "everywhere",
    prompt: "the public price list /pricing",
    href: () => "/pricing",
  },
  resort_guide: {
    where: PUBLIC,
    prompt: "the Bakuriani resort guide /bakuriani",
    href: () => "/bakuriani",
  },
  browse: {
    where: PUBLIC,
    params: ["category"],
    prompt:
      "a listings page; category: apartments (apartments, cottages and hotels), hotels, sales, food, services, entertainment, transport, employment",
    href: (p) => {
      const category = str(p.category);
      return category ? `/${category}` : null;
    },
  },
  search_rent: {
    where: PUBLIC,
    params: [
      "zone",
      "check_in",
      "check_out",
      "guests",
      "rooms",
      "price_max",
      "types",
    ],
    prompt:
      "search places to stay (no account needed), prefilled: zone, check_in, check_out, guests, rooms, price_max (the highest price per night in GEL), types (apartment, cottage, hotel, studio, villa)",
    href: (p) => {
      const priceMax = num(p.price_max);
      return withQuery("/search", {
        location: str(p.zone),
        check_in: str(p.check_in),
        check_out: str(p.check_out),
        guests: num(p.guests),
        mode: "rent",
        price_max:
          priceMax !== undefined && priceMax < 1000 ? priceMax : undefined,
        rooms: num(p.rooms),
        types: Array.isArray(p.types) ? p.types.join(",") : undefined,
      });
    },
  },
  search_sale: {
    where: PUBLIC,
    params: ["zone", "types", "price_max", "rooms"],
    prompt:
      "search property for sale (no account needed), prefilled: zone, types (apartment, cottage, hotel, studio, villa, land), price_max (the highest total price in GEL), rooms (exact; 4 = four or more)",
    href: (p) =>
      withQuery("/sales/all", {
        types: Array.isArray(p.types) ? p.types.join(",") : undefined,
        location: str(p.zone),
        price_max: num(p.price_max),
        rooms: num(p.rooms),
      }),
  },
  sign_in: {
    where: "visitors",
    prompt: 'sign in ("შესვლა")',
    href: () => "/auth/login",
  },
  register: {
    where: "visitors",
    prompt: 'register a new account ("რეგისტრაცია" tab)',
    href: () => "/auth/login?mode=register",
  },
  forgot_password: {
    where: "visitors",
    prompt: "reset a forgotten password",
    href: () => "/auth/forgot-password",
  },
  my_dashboard: {
    where: "members",
    prompt: "the user's dashboard (their home cabinet)",
    href: () => "/dashboard",
  },
  account: {
    where: "members",
    prompt:
      'sign-in methods, Google linking and notification settings ("შესვლის მეთოდები")',
    href: () => "/dashboard/account",
  },
  ownership: {
    where: ["renter", "seller", "account", "create"],
    account: true,
    prompt: 'ownership verification ("მესაკუთრეობის დადასტურება")',
    href: () => "/dashboard/account/ownership",
  },
  notifications: {
    where: "members",
    prompt: "all notifications",
    href: () => "/notifications",
  },
  add_listing: {
    where: [
      "public",
      "auth",
      "guest",
      "renter",
      "seller",
      "food",
      "entertainment",
      "transport",
      "employment",
      "services",
      "cleaner",
      "account",
      "create",
    ],
    account: true,
    params: ["category"],
    prompt:
      "add a listing; category: rental, sale, food, service, transport, entertainment, employment (none = the category picker)",
    href: (p) => {
      const category = str(p.category);
      return category ? `/create/${category}` : "/create";
    },
  },
  smart_match: {
    where: PUBLIC,
    account: true,
    params: [
      "zone",
      "check_in",
      "check_out",
      "guests",
      "budget_min",
      "budget_max",
    ],
    prompt:
      "the Smart Match request form, prefilled: zone, check_in, check_out, guests, budget_min, budget_max (GEL per night); the user sends it",
    href: (p) =>
      withQuery("/dashboard/guest", {
        [SMART_MATCH_PARAM]: SMART_MATCH_VALUE,
        [SMART_MATCH_PREFILL.zone]: str(p.zone),
        [SMART_MATCH_PREFILL.checkIn]: str(p.check_in),
        [SMART_MATCH_PREFILL.checkOut]: str(p.check_out),
        [SMART_MATCH_PREFILL.guests]: num(p.guests),
        [SMART_MATCH_PREFILL.budgetMin]: num(p.budget_min),
        [SMART_MATCH_PREFILL.budgetMax]: num(p.budget_max),
      }),
  },
  favorites: {
    where: ["public", "guest"],
    account: true,
    prompt: 'saved listings ("რჩეულები")',
    href: () => "/dashboard/guest/favorites",
  },
  offers: {
    where: ["guest"],
    prompt: 'Smart Match offers received ("მიღებული შეთავაზებები")',
    href: () => "/dashboard/guest/bookings",
  },
  settings: {
    where: Object.keys(SETTINGS) as SupportCabinet[],
    prompt:
      "this cabinet's settings or profile page (name, phone, profile photo)",
    href: (_p, ctx) => SETTINGS[ctx.cabinet] ?? null,
  },
  my_listings: {
    where: Object.keys(LISTINGS) as SupportCabinet[],
    prompt: "the user's own listings in this cabinet",
    href: (_p, ctx) => LISTINGS[ctx.cabinet] ?? null,
  },
  membership: {
    where: ["renter", "create", "guest", "account", "public"],
    account: true,
    prompt:
      'open the seasonal rental membership payment window ("წევრობის გააქტიურება"); the user chooses and pays',
    href: () => withQuery("/dashboard/renter", { [MEMBERSHIP_PARAM]: 1 }),
  },
  calendar: {
    where: ["renter"],
    prompt: 'the bookings calendar ("კალენდარი")',
    href: () => "/dashboard/renter/calendar",
  },
  renter_guests: {
    where: ["renter"],
    prompt: 'the guest list and blacklist ("სტუმრები")',
    href: () => "/dashboard/renter/guests",
  },
  cleaners: {
    where: ["renter"],
    prompt: 'cleaners and call-outs ("დამლაგებლები")',
    href: () => "/dashboard/renter/cleaners",
  },
  renter_smart_match: {
    where: ["renter"],
    prompt: "guests' Smart Match requests to answer with offers",
    href: () => "/dashboard/renter/smart-match",
  },
  sms_center: {
    where: ["renter"],
    prompt: 'SMS automations to guests ("SMS ცენტრი")',
    href: () => "/dashboard/sms",
  },
  balance: {
    where: BALANCE,
    prompt:
      '"ბალანსი და VIP": balance, VIP / SUPER VIP, discount badge, SMS packages',
    href: (_p, ctx) => `/dashboard/${ctx.cabinet}/balance`,
  },
  topup: {
    where: BALANCE,
    params: ["amount"],
    prompt:
      'open the card top-up window ("ბალანსის შევსება"), optionally with an amount in GEL (max 2000); the user pays on Keepz',
    href: (p, ctx) =>
      withQuery(`/dashboard/${ctx.cabinet}/balance`, {
        [TOPUP_PARAM]: num(p.amount) ?? TOPUP_OPEN,
      }),
  },
  leads: {
    where: ["seller"],
    prompt: 'the client sales board ("კლიენტები / ბაზა")',
    href: () => "/dashboard/seller/leads",
  },
  analytics: {
    where: ["seller"],
    prompt: "views, phone reveals and favorites of sale listings",
    href: () => "/dashboard/seller/analytics",
  },
  organizations: {
    where: ["seller"],
    prompt: 'register a company or join an agency ("ჩემი ორგანიზაციები")',
    href: () => "/dashboard/seller/organizations",
  },
  schedule: {
    where: ["cleaner"],
    prompt: 'the cleaner\'s schedule ("გრაფიკი")',
    href: () => "/dashboard/cleaner/schedule",
  },
  menu: {
    where: ["food"],
    prompt: 'the PDF menu, its link and dish discounts ("ჩემი მენიუ (PDF)")',
    href: () => "/dashboard/food/orders",
  },
  orders: {
    where: ORDERS,
    prompt: "customers' messages (job applications with CVs for employment)",
    href: (_p, ctx) => `/dashboard/${ctx.cabinet}/orders`,
  },
  admin_verifications: {
    where: ["admin"],
    params: ["tab"],
    prompt:
      "the review queues; tab: listings (new listings), changes (content changes), ownership",
    href: (p) =>
      withQuery("/dashboard/admin/verifications", {
        tab: p.tab === "listings" ? undefined : str(p.tab),
      }),
  },
  admin_memberships: {
    where: ["admin"],
    prompt: "approve renter memberships",
    href: () => "/dashboard/admin/memberships",
  },
  admin_clients: {
    where: ["admin"],
    params: ["query"],
    prompt: "users, optionally searching for query",
    href: (p) => withQuery("/dashboard/admin/clients", { q: str(p.query) }),
  },
  admin_payments: {
    where: ["admin"],
    prompt: "card payments",
    href: () => "/dashboard/admin/payments",
  },
  admin_prices: {
    where: ["admin"],
    prompt: "prices and packages",
    href: () => "/dashboard/admin/settings",
  },
  admin_finances: {
    where: ["admin"],
    prompt: "finances and tax reports",
    href: () => "/dashboard/admin/finances",
  },
} satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

function definition(id: string): ActionDef | null {
  return Object.prototype.hasOwnProperty.call(ACTIONS, id)
    ? (ACTIONS as Record<string, ActionDef>)[id]
    : null;
}

/** Whether the button may be offered to this user in this area of the site. */
export function isActionAvailable(
  id: string,
  ctx: Pick<ActionContext, "cabinet" | "signedIn">,
): boolean {
  const def = definition(id);
  if (!def) return false;
  if (def.where === "everywhere") return true;
  if (def.where === "visitors") return !ctx.signedIn;
  if (def.where === "members") return ctx.signedIn;
  return def.where.includes(ctx.cabinet);
}

export function availableActionIds(
  ctx: Pick<ActionContext, "cabinet" | "signedIn">,
): ActionId[] {
  return ACTION_IDS.filter((id) => isActionAvailable(id, ctx));
}

/** The model's button catalogue: one line per action. */
export function actionCatalogue(): string {
  return ACTION_IDS.map((id) => `- ${id}: ${ACTIONS[id].prompt}`).join("\n");
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return undefined;
  // Rejects 2026-02-31 and the like: the parsed date must print back the same.
  return new Date(time).toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function wholeNumber(value: unknown, min: number, max: number) {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" &&
    Number.isFinite(number) &&
    number >= min &&
    number <= max
    ? Math.round(number)
    : undefined;
}

/** A listed zone for what the model wrote ("დიდველი" -> "დიდველი / კრისტალი"). */
export function matchZone(
  value: unknown,
  zones: readonly string[],
): string | undefined {
  if (typeof value !== "string") return undefined;
  const wanted = value.replace(/\s+/g, " ").trim();
  if (!wanted) return undefined;
  return (
    zones.find((zone) => zone === wanted) ??
    zones.find((zone) =>
      zone
        .split("/")
        .map((part) => part.trim())
        .includes(wanted),
    )
  );
}

function plainQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text ? Array.from(text).slice(0, MAX_QUERY).join("") : undefined;
}

function oneOf<T extends string>(list: readonly T[], value: unknown) {
  return typeof value === "string" &&
    (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** A date window inside [today, today + 18 months], check-out after check-in. */
function dateWindow(
  raw: Record<string, unknown>,
  today: string,
): { checkIn?: string; checkOut?: string } {
  const last = addDays(today, MAX_DAYS_AHEAD);
  const within = (day: string | undefined) =>
    day && day >= today && day <= last ? day : undefined;
  const checkIn = within(isoDate(raw.check_in));
  let checkOut = within(isoDate(raw.check_out));
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = undefined;
  return { checkIn, checkOut };
}

/**
 * The button the model asked for, if it may be offered here, with only the
 * params its action takes and only valid values. Null for anything else.
 */
export function normalizeAction(
  id: string,
  raw: unknown,
  ctx: ActionContext,
): SupportActionRef | null {
  const def = definition(id);
  if (!def || !isActionAvailable(id, ctx)) return null;
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const params: ActionParams = {};
  const { checkIn, checkOut } = dateWindow(input, ctx.today);
  for (const key of def.params ?? []) {
    let value: string | number | string[] | undefined;
    switch (key) {
      case "category":
        value =
          id === "browse"
            ? oneOf(BROWSE_CATEGORIES, input.category)
            : oneOf(CREATE_KINDS, input.category);
        break;
      case "zone":
        value = matchZone(input.zone, ctx.zones);
        break;
      case "check_in":
        value = checkIn;
        break;
      case "check_out":
        value = checkOut;
        break;
      case "guests":
        value = wholeNumber(input.guests, 1, MAX_GUESTS);
        break;
      case "rooms":
        value = wholeNumber(input.rooms, 1, MAX_ROOMS);
        break;
      case "price_max":
        value = wholeNumber(
          input.price_max,
          1,
          id === "search_sale" ? MAX_SALE_PRICE : MAX_MONEY,
        );
        break;
      case "budget_max":
        value = wholeNumber(input.budget_max, 1, MAX_MONEY);
        break;
      case "budget_min":
        value = wholeNumber(input.budget_min, 0, MAX_MONEY);
        break;
      case "types": {
        const list = Array.isArray(input.types) ? input.types : [];
        const types = [
          ...new Set(
            list.filter(
              (item): item is string =>
                typeof item === "string" &&
                (SEARCH_PROPERTY_TYPES as readonly string[]).includes(item),
            ),
          ),
        ];
        value = types.length > 0 ? types : undefined;
        break;
      }
      case "amount":
        value = wholeNumber(input.amount, 1, MAX_TOPUP_GEL);
        break;
      case "tab":
        value = oneOf(VERIFICATION_TABS, input.tab);
        break;
      case "query":
        value = plainQuery(input.query);
        break;
    }
    if (value !== undefined) params[key] = value;
  }
  if (
    typeof params.budget_min === "number" &&
    typeof params.budget_max === "number" &&
    params.budget_min > params.budget_max
  )
    delete params.budget_min;
  // A browse button without a category leads nowhere.
  if (id === "browse" && !params.category) return null;
  return Object.keys(params).length > 0 ? { id, params } : { id };
}

/**
 * The link a button opens, locale-free (the browser's locale-aware router adds
 * the prefix): a same-site path with query, or tel:/mailto: for contact.
 * Re-validates the ref first, so a tampered saved chat can't open anything
 * else. Needs-an-account buttons send visitors to sign in and on from there.
 */
export function actionHref(
  ref: SupportActionRef,
  ctx: ActionContext,
): string | null {
  const checked = normalizeAction(ref.id, ref.params, ctx);
  const def = checked ? definition(checked.id) : null;
  if (!checked || !def) return null;
  const target = def.href(checked.params ?? {}, ctx);
  if (!target) return null;
  if (def.account && !ctx.signedIn) {
    return `/auth/login?next=${encodeURIComponent(target)}`;
  }
  return target;
}

/** Whether a button leaves the site for the phone or mail app. */
export function isExternalHref(href: string): boolean {
  return href.startsWith("tel:") || href.startsWith("mailto:");
}

/**
 * Every page a button can open, for the unit test that checks each exists
 * (C43): each action, in every area where it is offered, signed in.
 */
export function actionPagePaths(cabinets: readonly SupportCabinet[]): string[] {
  const paths = new Set<string>();
  for (const id of ACTION_IDS) {
    const def: ActionDef = ACTIONS[id];
    const categories: readonly (string | undefined)[] =
      id === "browse"
        ? BROWSE_CATEGORIES
        : id === "add_listing"
          ? [undefined, ...CREATE_KINDS]
          : [undefined];
    for (const cabinet of cabinets) {
      const ctx: ActionContext = {
        cabinet,
        signedIn: true,
        today: "2026-01-01",
        zones: [],
      };
      if (!isActionAvailable(id, ctx)) continue;
      for (const category of categories) {
        const href = def.href(category ? { category } : {}, ctx);
        if (href && href.startsWith("/")) paths.add(href.split("?")[0]);
      }
    }
  }
  return [...paths].sort();
}

/** Smart Match form values from its deep link; invalid ones are dropped. */
export function parseSmartMatchPrefill(
  get: (name: string) => string | null,
  today: string,
): {
  zone?: string;
  checkIn?: string;
  checkOut?: string;
  guestsCount?: number;
  budgetMin?: number;
  budgetMax?: number;
} {
  const { checkIn, checkOut } = dateWindow(
    {
      check_in: get(SMART_MATCH_PREFILL.checkIn),
      check_out: get(SMART_MATCH_PREFILL.checkOut),
    },
    today,
  );
  const zone = plainQuery(get(SMART_MATCH_PREFILL.zone));
  const guestsCount = wholeNumber(
    get(SMART_MATCH_PREFILL.guests),
    1,
    MAX_GUESTS,
  );
  let budgetMin = wholeNumber(get(SMART_MATCH_PREFILL.budgetMin), 0, MAX_MONEY);
  const budgetMax = wholeNumber(
    get(SMART_MATCH_PREFILL.budgetMax),
    1,
    MAX_MONEY,
  );
  if (
    budgetMin !== undefined &&
    budgetMax !== undefined &&
    budgetMin > budgetMax
  )
    budgetMin = undefined;
  const prefill = {
    zone,
    checkIn,
    checkOut,
    guestsCount,
    budgetMin,
    budgetMax,
  };
  return Object.fromEntries(
    Object.entries(prefill).filter(([, value]) => value !== undefined),
  );
}

/**
 * The top-up deep link: undefined = not asked, null = open without an amount
 * (TOPUP_OPEN or anything invalid), a number = that amount in GEL (1..2000).
 */
export function parseTopUpParam(
  value: string | null,
): number | null | undefined {
  if (value === null) return undefined;
  return wholeNumber(value, 1, MAX_TOPUP_GEL) ?? null;
}

/**
 * The browser's guard on a button link from the server or a saved chat: a
 * same-site path (never `//`, a backslash, a control character or /api), or
 * exactly the site's own tel:/mailto: link.
 */
export function isSafeActionHref(
  href: unknown,
  contact: { phone: string; email: string },
): href is string {
  if (typeof href !== "string" || href.length > 600) return false;
  if (href === `tel:${contact.phone}` || href === `mailto:${contact.email}`)
    return true;
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !/[\\\u0000-\u001F\u007F]/.test(href) &&
    !/^\/api(?:[/?#]|$)/.test(href)
  );
}
