import { expect, test, type APIRequestContext } from "@playwright/test";
import { NON_INDEXABLE_PREFIXES } from "../../src/lib/seo/robots";

// SEO surface (C40). Every assertion reads what a crawler gets: raw HTML and
// headers, no JavaScript.
//
// A deployment is in one of two modes and robots.txt says which: a `Sitemap:`
// line means the canonical host (indexable), no line means every other host
// (staging, preview, local), which must say noindex everywhere. The tests check
// that all signals agree with it. e2e/helpers/env.ts refuses the production
// host, so the indexable branch runs only against a build made with
// NEXT_PUBLIC_SITE_URL=https://mybakuriani.ge (point E2E_BASE_URL at it).

const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const CANONICAL_ORIGIN = "https://mybakuriani.ge";
const LOCALES = ["ka", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];
const OG_LOCALE: Record<Locale, string> = {
  ka: "ka_GE",
  en: "en_US",
  ru: "ru_RU",
};

// Locale-less paths of every public page that has its own URL in the sitemap.
const PAGES = [
  "/",
  "/apartments",
  "/hotels",
  "/sales",
  "/food",
  "/services",
  "/entertainment",
  "/transport",
  "/employment",
  "/blog",
  "/bakuriani",
  "/bakuriani/getting-there",
  "/bakuriani/ski-lifts",
  "/bakuriani/didveli",
  "/bakuriani/centri",
  "/bakuriani/kokhta",
  "/bakuriani/25ianebi",
  "/faq",
  "/pricing",
  "/contact",
  "/terms",
  "/privacy",
  "/marketing-policy",
];

// The pages without a visible breadcrumb trail (and so no BreadcrumbList).
const NO_BREADCRUMB = new Set([
  "/",
  "/faq",
  "/pricing",
  "/terms",
  "/privacy",
  "/marketing-policy",
]);

// Retired or never-eligible markup (C40): a page that emits one is a manual
// action waiting to happen.
const FORBIDDEN_TYPES = [
  "FAQPage",
  "SearchAction",
  "JobPosting",
  "VacationRental",
  "AggregateRating",
];

type ListingKind =
  | "apartments"
  | "hotels"
  | "sales"
  | "food"
  | "services"
  | "entertainment"
  | "transport"
  | "employment";

// Another route of the same table: properties share three, services five.
const OTHER_ROUTE: Record<ListingKind, ListingKind> = {
  apartments: "hotels",
  hotels: "sales",
  sales: "apartments",
  food: "transport",
  services: "employment",
  entertainment: "food",
  transport: "services",
  employment: "entertainment",
};

interface Fetched {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function get(request: APIRequestContext, path: string): Promise<Fetched> {
  const res = await request.get(path, {
    maxRedirects: 0,
    headers: { "user-agent": GOOGLEBOT },
  });
  return {
    status: res.status(),
    headers: res.headers(),
    body: await res.text(),
  };
}

function localized(path: string, locale: Locale): string {
  if (locale === "ka") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function head(html: string): string {
  const end = html.indexOf("</head>");
  return end === -1 ? html : html.slice(0, end);
}

function tags(html: string, name: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const tag of html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))) {
    const attrs: Record<string, string> = {};
    for (const attr of tag[1].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2]);
    }
    found.push(attrs);
  }
  return found;
}

function metaContent(html: string, key: "name" | "property", value: string) {
  return tags(head(html), "meta")
    .filter((meta) => meta[key] === value)
    .map((meta) => meta.content ?? "");
}

function canonicalOf(html: string): string | undefined {
  return tags(head(html), "link").find((link) => link.rel === "canonical")
    ?.href;
}

function textOf(fragment: string): string {
  return decode(fragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function h1s(html: string): string[] {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    textOf(m[1]),
  );
}

function jsonLd(html: string, where: string): unknown[] {
  return [
    ...html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch (error) {
      throw new Error(`${where}: a JSON-LD block is not valid JSON (${error})`);
    }
  });
}

function walk(node: unknown, visit: (record: Record<string, unknown>) => void) {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    visit(record);
    Object.values(record).forEach((child) => walk(child, visit));
  }
}

function typesIn(blocks: unknown[]): string[] {
  const types: string[] = [];
  walk(blocks, (record) => {
    const type = record["@type"];
    if (typeof type === "string") types.push(type);
    if (Array.isArray(type)) {
      types.push(...type.filter((t): t is string => typeof t === "string"));
    }
  });
  return types;
}

function breadcrumbItems(blocks: unknown[]): { name: string; item: string }[] {
  let trail: { name: string; item: string }[] = [];
  walk(blocks, (record) => {
    if (record["@type"] === "BreadcrumbList" && trail.length === 0) {
      trail = record.itemListElement as { name: string; item: string }[];
    }
  });
  return trail;
}

function sorted(record: Record<string, string>): [string, string][] {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
}

async function isIndexable(request: APIRequestContext): Promise<boolean> {
  const robots = await get(request, "/robots.txt");
  expect(robots.status).toBe(200);
  return /^sitemap:/im.test(robots.body);
}

function listingHref(html: string, kind: ListingKind): string | undefined {
  for (const match of html.matchAll(
    new RegExp(`href="(/${kind}/[^"/?#]+)"`, "g"),
  )) {
    if (match[1] !== "/sales/all") return match[1];
  }
  return undefined;
}

test.describe("indexing policy", () => {
  test("robots.txt, X-Robots-Tag, the robots meta and the sitemap state one policy", async ({
    request,
  }) => {
    const robots = await get(request, "/robots.txt");
    expect(robots.status).toBe(200);
    const indexable = /^sitemap:/im.test(robots.body);
    const home = await get(request, "/");
    const robotsMeta = metaContent(home.body, "name", "robots").join(",");
    const sitemap = await get(request, "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers["content-type"]).toContain("xml");

    if (indexable) {
      expect(robots.body).toContain(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
      expect(robots.body).toMatch(/^Allow: \/api\/og\/$/m);
      expect(robots.body).toMatch(/^Disallow: \/api\/$/m);
      for (const prefix of NON_INDEXABLE_PREFIXES) {
        for (const locale of LOCALES) {
          expect(robots.body).toMatch(
            new RegExp(`^Disallow: ${localized(prefix, locale)}$`, "m"),
          );
        }
      }
      expect(home.headers["x-robots-tag"]).toBeUndefined();
      expect(robotsMeta).not.toMatch(/noindex|nofollow/);
      expect(sitemap.body).toContain("<url>");
    } else {
      // Crawlable on purpose: a Disallow would hide the noindex from Google.
      expect(robots.body).not.toMatch(/^disallow:/im);
      expect(home.headers["x-robots-tag"]).toMatch(/noindex/);
      expect(robotsMeta).toMatch(/noindex/);
      expect(sitemap.body).not.toContain("<url>");
    }
  });

  test("/search and /sales/all are never indexed", async ({ request }) => {
    for (const path of ["/search", "/sales/all"]) {
      const page = await get(request, path);
      expect(page.status, path).toBe(200);
      expect(metaContent(page.body, "name", "robots").join(","), path).toMatch(
        /noindex/,
      );
    }
  });

  // Lighthouse's Agentic Browsing category audits it: Markdown with one H1.
  // Static file, so its links name the canonical host whatever host serves it.
  test("llms.txt is Markdown with one H1 and links that resolve", async ({
    request,
  }) => {
    const res = await get(request, "/llms.txt");
    expect(res.status).toBe(200);
    expect(res.body.match(/^# \S/gm)).toHaveLength(1);
    const links = [...res.body.matchAll(/\]\((https?:[^)]+)\)/g)].map(
      (m) => m[1],
    );
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) {
      expect(new URL(link).origin, link).toBe(CANONICAL_ORIGIN);
      expect((await get(request, new URL(link).pathname)).status, link).toBe(
        200,
      );
    }
  });
});

test.describe("public pages", () => {
  for (const locale of LOCALES) {
    test(`${locale}: each page is self-canonical, lists its alternates, has one h1 and honest markup`, async ({
      request,
    }) => {
      const indexable = await isIndexable(request);
      const problems: string[] = [];
      const titles = new Map<string, string>();
      const headings = new Map<string, string>();

      await Promise.all(
        PAGES.map(async (page) => {
          const path = localized(page, locale);
          const res = await get(request, path);
          const at = (what: string) => `${path}: ${what}`;
          if (res.status !== 200) {
            problems.push(at(`status ${res.status}`));
            return;
          }

          const html = res.body;
          const canonical = canonicalOf(html);
          const alternates = Object.fromEntries(
            tags(head(html), "link")
              .filter((link) => link.rel === "alternate" && link.hreflang)
              .map((link) => [link.hreflang, link.href]),
          );

          if (!canonical) {
            problems.push(at("no canonical"));
          } else {
            const url = new URL(canonical);
            if (url.pathname !== path) {
              problems.push(at(`canonical path is ${url.pathname}`));
            }
            if (indexable && url.origin !== CANONICAL_ORIGIN) {
              problems.push(at(`canonical origin is ${url.origin}`));
            }
            for (const [lang, href] of Object.entries(alternates)) {
              if (new URL(href).origin !== url.origin) {
                problems.push(at(`hreflang ${lang} has another origin`));
              }
            }
            const expected = {
              ka: page,
              en: localized(page, "en"),
              ru: localized(page, "ru"),
              "x-default": page,
            };
            const actual = Object.fromEntries(
              Object.entries(alternates).map(([lang, href]) => [
                lang,
                new URL(href).pathname,
              ]),
            );
            if (
              JSON.stringify(sorted(actual)) !==
              JSON.stringify(sorted(expected))
            ) {
              problems.push(at(`hreflang is ${JSON.stringify(actual)}`));
            }
            const ogUrl = metaContent(html, "property", "og:url")[0];
            if (ogUrl !== canonical) problems.push(at(`og:url is ${ogUrl}`));
          }

          if (
            res.headers.link &&
            /hreflang|rel="?alternate/i.test(res.headers.link)
          ) {
            problems.push(at("hreflang in the HTTP Link header"));
          }
          const lang = html.match(/<html\b[^>]*\blang="([^"]*)"/i)?.[1];
          if (lang !== locale) problems.push(at(`<html lang> is ${lang}`));
          const ogLocale = metaContent(html, "property", "og:locale")[0];
          if (ogLocale !== OG_LOCALE[locale]) {
            problems.push(at(`og:locale is ${ogLocale}`));
          }
          const ogAlternates = metaContent(
            html,
            "property",
            "og:locale:alternate",
          )
            .sort()
            .join();
          const wantAlternates = LOCALES.filter((l) => l !== locale)
            .map((l) => OG_LOCALE[l])
            .sort()
            .join();
          if (ogAlternates !== wantAlternates) {
            problems.push(at(`og:locale:alternate is ${ogAlternates}`));
          }

          const robotsMeta = metaContent(html, "name", "robots").join(",");
          if (indexable && /noindex/.test(robotsMeta)) {
            problems.push(at("noindex on the canonical host"));
          }
          if (!indexable && !/noindex/.test(robotsMeta)) {
            problems.push(at("indexable meta on a non-canonical host"));
          }
          if (/<div hidden id="S:\d+"/.test(html)) {
            problems.push(at("content parked in a hidden streaming segment"));
          }

          const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
          if (!title?.trim()) problems.push(at("no <title>"));
          else titles.set(path, decode(title.trim()));
          const headingsHere = h1s(html);
          if (headingsHere.length !== 1) {
            problems.push(at(`${headingsHere.length} h1 elements`));
          } else {
            headings.set(path, headingsHere[0]);
          }

          const blocks = jsonLd(html, path);
          const types = typesIn(blocks);
          for (const forbidden of FORBIDDEN_TYPES) {
            if (types.includes(forbidden)) {
              problems.push(at(`emits ${forbidden}`));
            }
          }
          if (page === "/") {
            for (const type of ["Organization", "WebSite"]) {
              if (!types.includes(type)) problems.push(at(`no ${type} markup`));
            }
          }
          if (page === "/bakuriani" && !types.includes("TouristDestination")) {
            problems.push(at("no TouristDestination markup"));
          }
          const trail = breadcrumbItems(blocks);
          if (NO_BREADCRUMB.has(page)) {
            if (trail.length) problems.push(at("has a BreadcrumbList"));
          } else if (trail.length < 2) {
            problems.push(at("no BreadcrumbList"));
          } else if (trail.at(-1)?.item !== canonical) {
            problems.push(at(`breadcrumb ends at ${trail.at(-1)?.item}`));
          }
        }),
      );

      // A title or heading shared by two pages is the thin-content signal the
      // overhaul removed (one generic h1 on four pages).
      for (const [label, byPath] of [
        ["title", titles],
        ["h1", headings],
      ] as const) {
        const seen = new Map<string, string>();
        for (const [path, value] of [...byPath].sort()) {
          const other = seen.get(value);
          if (other) problems.push(`${path}: same ${label} as ${other}`);
          else seen.set(value, path);
        }
      }

      expect(problems.sort()).toEqual([]);
    });
  }
});

test.describe("listing pages", () => {
  const KINDS = Object.keys(OTHER_ROUTE) as ListingKind[];

  for (const kind of KINDS) {
    test(`${kind}: a listing has one URL, a breadcrumb and one h1`, async ({
      request,
    }) => {
      const index = await get(request, `/${kind}`);
      expect(index.status).toBe(200);
      const path = listingHref(index.body, kind);
      test.skip(!path, `no ${kind} listing is linked from /${kind}`);
      const href = path as string;
      const id = href.split("/")[2];

      const page = await get(request, href);
      expect(page.status).toBe(200);
      const canonical = canonicalOf(page.body);
      expect(new URL(canonical ?? "http://none").pathname).toBe(href);
      expect(h1s(page.body)).toHaveLength(1);
      expect(page.body).not.toMatch(/<div hidden id="S:\d+"/);

      const blocks = jsonLd(page.body, href);
      const trail = breadcrumbItems(blocks);
      expect(trail.length).toBeGreaterThanOrEqual(3);
      expect(trail.at(-1)?.item).toBe(canonical);
      if (kind === "hotels") expect(typesIn(blocks)).toContain("Hotel");
      if (kind === "food") expect(typesIn(blocks)).toContain("Restaurant");
      for (const forbidden of FORBIDDEN_TYPES) {
        expect(typesIn(blocks), href).not.toContain(forbidden);
      }

      // The same id on another route of its table redirects here.
      const wrong = await get(request, `/${OTHER_ROUTE[kind]}/${id}`);
      expect(wrong.status).toBe(308);
      expect(new URL(wrong.headers.location, "http://x").pathname).toBe(href);
    });
  }

  test("unknown ids, mock ids and unknown guide areas answer 404", async ({
    request,
  }) => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const paths = [
      ...(Object.keys(OTHER_ROUTE) as ListingKind[]).map(
        (kind) => `/${kind}/${missing}`,
      ),
      `/en/hotels/${missing}`,
      "/apartments/prop-1",
      "/food/food-1",
      "/bakuriani/nowhere",
      "/en/bakuriani/nowhere",
    ];
    for (const path of paths) {
      expect((await get(request, path)).status, path).toBe(404);
    }
  });

  test("/appartments redirects to /apartments in every locale", async ({
    request,
  }) => {
    for (const locale of LOCALES) {
      const res = await get(request, localized("/appartments", locale));
      expect(res.status, locale).toBe(308);
      expect(new URL(res.headers.location, "http://x").pathname).toBe(
        localized("/apartments", locale),
      );
    }
  });
});

test.describe("blog and long-form pages", () => {
  test("a blog post is served under its slug with BlogPosting markup", async ({
    request,
  }) => {
    const index = await get(request, "/blog");
    expect(index.status).toBe(200);
    const path = /href="(\/blog\/[^"/?#]+)"/.exec(index.body)?.[1];
    test.skip(!path, "no blog post is linked from /blog");
    const href = path as string;

    const post = await get(request, href);
    expect(post.status).toBe(200);
    expect(new URL(canonicalOf(post.body) ?? "http://none").pathname).toBe(
      new URL(href, "http://x").pathname,
    );
    expect(h1s(post.body)).toHaveLength(1);
    const blocks = jsonLd(post.body, href);
    expect(typesIn(blocks)).toContain("BlogPosting");
    expect(breadcrumbItems(blocks).length).toBeGreaterThanOrEqual(3);
  });

  test("FAQ answers are in the HTML while collapsed", async ({ request }) => {
    for (const path of ["/faq", "/bakuriani"]) {
      const page = await get(request, path);
      const items = [...page.body.matchAll(/<details\b[\s\S]*?<\/details>/g)];
      expect(items.length, path).toBeGreaterThanOrEqual(5);
      for (const [item] of items) {
        const answer = textOf(
          item.replace(/<summary\b[\s\S]*?<\/summary>/, ""),
        );
        expect(answer.length, `${path}: ${item.slice(0, 80)}`).toBeGreaterThan(
          20,
        );
      }
    }
  });
});

test.describe("sitemap.xml", () => {
  test("is well-formed, canonical, self-referencing and free of private or seeded URLs", async ({
    request,
  }) => {
    test.skip(
      !(await isIndexable(request)),
      "a non-canonical host serves an empty sitemap (covered above)",
    );
    const sitemap = await get(request, "/sitemap.xml");
    expect(sitemap.status).toBe(200);
    const xml = sitemap.body;

    // Next writes the values verbatim, so a raw `&` breaks the file and a
    // double-escaped one means Next started escaping and xmlEscape must go.
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    expect(xml).not.toContain("&amp;amp;");

    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
      const block = m[1];
      const loc = decode(/<loc>([^<]*)<\/loc>/.exec(block)?.[1] ?? "");
      const languages = Object.fromEntries(
        [...block.matchAll(/<xhtml:link\b([^>]*)\/?>/g)].map((link) => {
          const attrs = Object.fromEntries(
            [...link[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [
              a[1].toLowerCase(),
              decode(a[2]),
            ]),
          );
          return [attrs.hreflang, attrs.href];
        }),
      );
      return { loc, languages };
    });
    expect(urls.length).toBeGreaterThanOrEqual(PAGES.length * LOCALES.length);
    expect(new Set(urls.map((u) => u.loc)).size).toBe(urls.length);

    const locs = new Set(urls.map((u) => u.loc));
    for (const page of PAGES) {
      for (const locale of LOCALES) {
        // The home page is the bare origin, as in the page's own canonical.
        const path = localized(page, locale);
        const expected =
          path === "/" ? CANONICAL_ORIGIN : CANONICAL_ORIGIN + path;
        expect(locs.has(expected), `${locale} ${page} is missing`).toBe(true);
      }
    }

    const privatePrefixes = [
      ...NON_INDEXABLE_PREFIXES,
      "/search",
      "/sales/all",
      "/api",
    ];
    const privatePath = new RegExp(
      `^(/(en|ru))?(${privatePrefixes.join("|")})(/|$)`,
    );
    for (const { loc, languages } of urls) {
      const url = new URL(loc);
      expect(url.origin, loc).toBe(CANONICAL_ORIGIN);
      expect(url.pathname, loc).not.toMatch(privatePath);
      expect(loc, loc).not.toMatch(/aae2ff00-|facade00-/);
      expect(Object.keys(languages).sort(), loc).toEqual([
        "en",
        "ka",
        "ru",
        "x-default",
      ]);
      expect(Object.values(languages), loc).toContain(loc);
    }

    // A spread of entries (statics and rows) must answer 200 and name the
    // sitemap's own URL as their canonical.
    const stride = Math.max(1, Math.floor(urls.length / 12));
    for (let i = 0; i < urls.length; i += stride) {
      const path = new URL(urls[i].loc).pathname;
      const page = await get(request, path);
      expect(page.status, path).toBe(200);
      expect(canonicalOf(page.body), path).toBe(urls[i].loc);
    }
  });
});

// Link-graph reachability (C40). A crawl that follows only <a href> in the
// server HTML found /en and /ru linked from nowhere and listings past the
// grid's first page reachable only through the sitemap.
test.describe("crawl paths", () => {
  test("every page links to itself in the other languages", async ({
    request,
  }) => {
    for (const [locale, path] of [
      ["ka", "/apartments"],
      ["en", "/hotels"],
      ["ru", "/food"],
    ] as const) {
      const html = (await get(request, localized(path, locale))).body;
      const footer = /<footer[\s\S]*<\/footer>/.exec(html)?.[0] ?? "";
      for (const other of LOCALES.filter((l) => l !== locale)) {
        const href = localized(path, other);
        expect(footer, `${locale} ${path} should link to ${href}`).toContain(
          `href="${href}"`,
        );
      }
      // The page's own language is shown as the current one, not as a link.
      expect(footer).toContain('aria-current="true"');
    }
  });

  test("every listing in the sitemap is linked from its category page", async ({
    request,
  }) => {
    test.skip(
      !(await isIndexable(request)),
      "a non-canonical host serves an empty sitemap",
    );
    const sitemap = (await get(request, "/sitemap.xml")).body;
    const paths = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(
      (m) => new URL(decode(m[1])).pathname,
    );
    const topics = [
      "apartments",
      "hotels",
      "sales",
      "food",
      "services",
      "entertainment",
      "transport",
      "employment",
    ];
    // The category queries stop at 100 rows (see CategoryIntro).
    const CAP = 100;
    for (const topic of topics) {
      const rows = paths.filter((p) =>
        new RegExp(`^/${topic}/[0-9a-f-]{36}$`).test(p),
      );
      const html = (await get(request, `/${topic}`)).body;
      const missing = rows.filter((p) => !html.includes(`href="${p}"`));
      expect(
        missing.length,
        `${topic}: listings in the sitemap but not linked from /${topic}: ${missing.slice(0, 3).join(", ")}`,
      ).toBeLessThanOrEqual(Math.max(0, rows.length - CAP));
    }
  });
});
