import { test, expect } from "@playwright/test";

/**
 * Listing cards ("განცხადება") must render at the same size regardless of how
 * much information each one carries.
 *
 * The seeded `min`/`max` stress pair (e2e/helpers/stress-fixtures.ts) is what
 * makes this meaningful: both are VIP with the newest created_at, so the public
 * ordering (is_super_vip desc, is_vip desc, created_at desc) pins them adjacent
 * in the first grid row - a 1-character title with no photo and no price next to
 * a full-length title with photos, a discount badge and every optional row.
 *
 * Three rules this file encodes, each learned from a false positive:
 *  - compare with a ~1px tolerance (fractional grid columns at 375/390px),
 *  - select cards by their data-* hook and group by the nearest ROW-axis layout
 *    ancestor - every category grid also renders <BannerSlot> inside the grid,
 *    and a `flex flex-col` wrapper never stretches children vertically,
 *  - ignore struck-through prices when locating the price anchor.
 */

const CARD_KINDS = [
  "listing",
  "service",
  "employment",
  "sale",
  "investment",
  "blog",
  "home-blog",
] as const;

const SURFACES = [
  "/apartments",
  "/hotels",
  "/sales",
  "/sales/all",
  "/food",
  "/services",
  "/entertainment",
  "/transport",
  "/employment",
  "/blog",
] as const;

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  // 768 is not padding: PropertyCard/ServiceCard used to carry `md:h-auto`,
  // which dropped their height between 768 and 1023px and left the shorter
  // card floating in a stretched cell. This is the band that regressed.
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

type Measurement = {
  grids: {
    kinds: string[];
    rows: { n: number; heightSpread: number; titleHeightSpread: number; ctaTopSpread: number }[];
  }[];
  unclamped: string[];
  clipped: { kind: string; by: number }[];
  notFilling: { kind: string; cardH: number; cellH: number }[];
  cardCount: number;
  /** True when a seeded `min` stress listing (1-character title) is on screen. */
  hasMinimalCard: boolean;
};

async function measureCards(page: import("@playwright/test").Page) {
  return page.evaluate((KINDS): Measurement => {
    const TOL = 1;
    const ROW_TOL = 2;
    const SELECTOR = KINDS.map((k) => `[data-${k}-card]`).join(",");
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden";
    };
    const cards = Array.from(document.querySelectorAll(SELECTOR)).filter(vis);
    const LAYOUT = new Set(["grid", "inline-grid", "flex", "inline-flex"]);
    const isRowAxis = (n: Element) => {
      const st = getComputedStyle(n);
      if (!LAYOUT.has(st.display)) return false;
      if (st.display.includes("flex")) return !st.flexDirection.startsWith("column");
      return true;
    };
    const gridOf = (card: Element) => {
      let n = card.parentElement;
      while (n && n !== document.body) {
        if (n.querySelectorAll(SELECTOR).length >= 2 && isRowAxis(n)) return n;
        n = n.parentElement;
      }
      return null;
    };
    const cellOf = (card: Element, grid: Element) => {
      let n: Element = card;
      while (n.parentElement && n.parentElement !== grid) n = n.parentElement;
      return n.parentElement === grid ? n : card;
    };
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const spread = (v: (number | null)[]) => {
      const nums = v.filter((x): x is number => typeof x === "number");
      return nums.length < 2 ? 0 : r1(Math.max(...nums) - Math.min(...nums));
    };

    const unclamped: string[] = [];
    const clipped: { kind: string; by: number }[] = [];
    const notFilling: { kind: string; cardH: number; cellH: number }[] = [];
    const byGrid = new Map<Element, Element[]>();
    for (const c of cards) {
      const g = gridOf(c);
      if (!g) continue;
      if (!byGrid.has(g)) byGrid.set(g, []);
      byGrid.get(g)!.push(c);
    }

    const grids = [] as Measurement["grids"];
    for (const [grid, members] of byGrid) {
      const measured = members
        .map((card) => {
          const kind = KINDS.find((k) => card.hasAttribute(`data-${k}-card`)) || "?";
          const cr = card.getBoundingClientRect();
          const cell = cellOf(card, grid).getBoundingClientRect();
          const top = cr.top;
          const title = card.querySelector("h2,h3");
          if (title) {
            const ts = getComputedStyle(title);
            const isClamped =
              (ts.webkitLineClamp && ts.webkitLineClamp !== "none") ||
              ts.textOverflow === "ellipsis" ||
              ts.overflow === "hidden";
            if (!isClamped) unclamped.push(kind);
          }
          const st = getComputedStyle(card);
          if (st.overflow === "hidden" && card.scrollHeight - card.clientHeight > TOL)
            clipped.push({ kind, by: card.scrollHeight - card.clientHeight });
          if (cr.height < cell.height - TOL)
            notFilling.push({ kind, cardH: r1(cr.height), cellH: r1(cell.height) });
          const inter = Array.from(card.querySelectorAll("a,button,[role='button']")).filter(vis);
          const cta = inter.length ? inter[inter.length - 1] : null;
          return {
            kind,
            y: cr.top + window.scrollY,
            h: r1(cr.height),
            titleH: title ? r1(title.getBoundingClientRect().height) : null,
            ctaTop: cta ? r1(cta.getBoundingClientRect().top - top) : null,
          };
        })
        .sort((a, b) => a.y - b.y);

      const rows: (typeof measured)[] = [];
      for (const m of measured) {
        const last = rows[rows.length - 1];
        if (last && m.y - last[0].y <= ROW_TOL) last.push(m);
        else rows.push([m]);
      }
      grids.push({
        kinds: [...new Set(measured.map((m) => m.kind))],
        rows: rows.map((row) => ({
          n: row.length,
          heightSpread: spread(row.map((m) => m.h)),
          titleHeightSpread: spread(row.map((m) => m.titleH)),
          ctaTopSpread: spread(row.map((m) => m.ctaTop)),
        })),
      });
    }
    const hasMinimalCard = cards.some((c) => {
      const t = c.querySelector("h2,h3");
      return !!t && (t.textContent || "").trim().length <= 2;
    });
    return {
      grids,
      unclamped,
      clipped,
      notFilling,
      cardCount: cards.length,
      hasMinimalCard,
    };
  }, CARD_KINDS as unknown as string[]);
}

for (const vp of VIEWPORTS) {
  test.describe(`card geometry @${vp.name} (${vp.width}px)`, () => {
    for (const path of SURFACES) {
      test(`${path} keeps every card the same size`, async ({ page }) => {
        test.setTimeout(150_000); // the ISR reload loop below can wait up to 90s
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(path);
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);

        let m = await measureCards(page);

        // Public list pages are ISR with `revalidate = 60`, so a page cached
        // before `setup` seeded can legitimately lag behind the database by up
        // to a minute. Reload until the seeded stress pair appears rather than
        // failing on a cache age that says nothing about layout.
        if (path !== "/blog") {
          const deadline = Date.now() + 90_000;
          while (!m.hasMinimalCard && Date.now() < deadline) {
            await page.waitForTimeout(4000);
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForTimeout(800);
            m = await measureCards(page);
          }
        }

        // Deliberately NOT test.skip(): "no cards" is the same vacuous pass the
        // audit script guards against with its redirect warning. A green run
        // must mean "cards were measured and were equal", never "nothing
        // rendered".
        expect(m.cardCount, `${path} rendered no cards at all`).toBeGreaterThan(0);

        // And the measurement is only meaningful if the stress pair is present:
        // real staging titles top out at 54 chars, so without the seeded 1-char
        // `min` card beside the full `max` one this asserts nothing about
        // "more information". /blog has no stress fixture.
        if (path !== "/blog") {
          expect(
            m.hasMinimalCard,
            `${path} has no minimal stress listing - seed e2e/helpers/stress-fixtures.ts first, ` +
              `otherwise this test cannot exercise the long-vs-short content case`,
          ).toBe(true);
        }

        // G4: every card title must be clamped, or a long title pushes the
        // rest of the card down and nothing below it can stay aligned.
        expect(m.unclamped, `unclamped titles on ${path}`).toEqual([]);
        // G3: a fixed-height card must not clip its own content.
        expect(m.clipped, `clipped cards on ${path}`).toEqual([]);
        // G1-fill: the card must fill the cell the grid stretched for it.
        expect(m.notFilling, `cards not filling their grid cell on ${path}`).toEqual([]);

        for (const grid of m.grids) {
          for (const row of grid.rows) {
            if (row.n < 2) continue;
            const where = `${path} [${grid.kinds.join("+")}]`;
            expect(row.heightSpread, `row height spread on ${where}`).toBeLessThanOrEqual(1);
            expect(row.titleHeightSpread, `title height spread on ${where}`).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  });
}
