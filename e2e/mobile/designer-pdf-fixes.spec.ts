import { test, expect, type Page } from "@playwright/test";

// Regression checks for the designer's mobile review (გასასწორებელი.pdf,
// 2026-09-24, seven slides). They run at each engine's narrowest real phone
// width, where these layouts are tightest: 360px on Chromium (common Android)
// and 375px on WebKit (no iPhone viewport is narrower).

const BACK = "უკან დაბრუნება"; // Shared.back
const CONDITIONS = "დამატებითი პირობები"; // EmploymentDetail.sidebar.title
const JOB_DESCRIPTION = "სამუშაოს აღწერა"; // EmploymentDetail.jobDescription
const STAT_LOCATION = "ლოკაცია"; // EmploymentDetail.stats.location
const SHARE = "გაზიარება"; // PhotoGallery.share
const FAVOURITE = "ფავორიტებში დამატება"; // PhotoGallery.addToFavorites

// window.__textLines(el): how many line boxes the visible text of `el` wraps to.
const TEXT_LINES = `window.__textLines = (el) => {
  const tops = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || n.parentElement.closest(".sr-only")) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width > 0.5 && !tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
    }
  }
  return tops.length;
};`;

type LinesWindow = Window & { __textLines(el: Element): number };

test.beforeEach(async ({ page, browserName }) => {
  const width = browserName === "webkit" ? 375 : 360;
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(TEXT_LINES);
});

async function openFirstDetail(page: Page, listPath: "/employment" | "/food") {
  await page.goto(listPath);
  const href = await page
    .locator(`a[href^="${listPath}/"]`)
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
}

test.describe("Designer PDF mobile fixes", () => {
  test("employment detail: conditions sit between the stat tiles and the job description (slide 1)", async ({
    page,
  }) => {
    await openFirstDetail(page, "/employment");
    await expect
      .poll(() =>
        page.locator("main").evaluate(
          (main, s) => {
            const shown = (e: Element) => e.getClientRects().length > 0;
            const heads = Array.from(main.querySelectorAll("h2, h3"));
            const cond = heads.find(
              (e) => e.textContent?.trim() === s.CONDITIONS && shown(e),
            );
            const desc = heads.find(
              (e) => e.textContent?.trim() === s.JOB_DESCRIPTION,
            );
            // the deepest element reading "ლოკაცია" (the label also holds an icon)
            const label = Array.from(main.querySelectorAll("*")).find(
              (e) =>
                e.textContent?.trim() === s.STAT_LOCATION &&
                !Array.from(e.children).some(
                  (c) => c.textContent?.trim() === s.STAT_LOCATION,
                ),
            );
            const tiles = label?.closest(".grid");
            if (!cond || !tiles) return "missing";
            const top = cond.getBoundingClientRect().top;
            if (top < tiles.getBoundingClientRect().bottom)
              return "above tiles";
            if (desc && top > desc.getBoundingClientRect().top)
              return "below the job description";
            // laid out horizontally: two labels per row
            const dtTops = Array.from(
              cond.parentElement!.querySelectorAll("dt"),
            ).map((d) => Math.round(d.getBoundingClientRect().top));
            const rows = new Set(dtTops).size;
            return rows === Math.ceil(dtTops.length / 2)
              ? "ok"
              : `${rows} rows`;
          },
          { CONDITIONS, JOB_DESCRIPTION, STAT_LOCATION },
        ),
      )
      .toBe("ok");
  });

  test("employment detail: back, share and date share one row (slide 2)", async ({
    page,
  }) => {
    await openFirstDetail(page, "/employment");
    await expect
      .poll(() =>
        page.locator("main").evaluate((main, back) => {
          const lines = (e: Element) => (window as LinesWindow).__textLines(e);
          const cy = (e: Element) => {
            const r = e.getBoundingClientRect();
            return r.top + r.height / 2;
          };
          const backBtn = main
            .querySelector('svg[class*="lucide-arrow-left"]')
            ?.closest("button");
          const row = backBtn?.parentElement;
          const share = row?.querySelector("button[aria-label]");
          const date = row?.querySelector(
            'svg[class*="lucide-clock"]',
          )?.parentElement;
          if (!backBtn || !share || !date) return "missing";
          const label = backBtn.textContent?.trim();
          if (label !== back) return `back reads "${label}"`;
          if (lines(backBtn) !== 1) return `back on ${lines(backBtn)} lines`;
          if (lines(date) !== 1) return `date on ${lines(date)} lines`;
          const ys = [cy(backBtn), cy(share), cy(date)];
          if (Math.max(...ys) - Math.min(...ys) > 2) return "not one row";
          const s = share.getBoundingClientRect();
          return s.width >= 43.5 && s.height >= 43.5 ? "ok" : "share < 44px";
        }, BACK),
      )
      .toBe("ok");
  });

  test("footer: legal links stay inside the side margins (slide 3)", async ({
    page,
  }) => {
    await page.goto("/faq");
    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        footer.evaluate((f) => {
          const privacy = f.querySelector('a[href$="/privacy"]');
          const links = privacy
            ? Array.from(privacy.parentElement!.children)
            : [];
          if (links.length !== 4) return `${links.length} legal links`;
          const vw = document.documentElement.clientWidth;
          const boxes = links.map((l) => l.getBoundingClientRect());
          for (const [i, link] of links.entries()) {
            const range = document.createRange();
            range.selectNodeContents(link);
            for (const r of Array.from(range.getClientRects())) {
              if (r.width > 0.5 && (r.left < 15.5 || r.right > vw - 15.5))
                return `link ${i} text outside the margins`;
            }
            if (boxes[i].height < 43.5) return `link ${i} shorter than 44px`;
          }
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const [a, b] = [boxes[i], boxes[j]];
              if (
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5
              )
                return `links ${i} and ${j} overlap`;
            }
          return "ok";
        }),
      )
      .toBe("ok");
  });

  test("landing employment card: full-width Details, badge, age and heart on one line (slides 4, 5)", async ({
    page,
  }) => {
    await page.goto("/");
    const card = page.locator("[data-employment-card]").first();
    await card.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        card.evaluate((c) => {
          const cs = getComputedStyle(c);
          const contentW =
            c.getBoundingClientRect().width -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight) -
            parseFloat(cs.borderLeftWidth) -
            parseFloat(cs.borderRightWidth);
          const details = Array.from(
            c.querySelectorAll('a[href*="/employment/"]'),
          ).pop();
          if (!details) return "missing Details";
          const w = details.getBoundingClientRect().width;
          if (Math.abs(w - contentW) > 1)
            return `Details ${Math.round(w)}px wide`;
          const cy = (e: Element) => {
            const r = e.getBoundingClientRect();
            return r.top + r.height / 2;
          };
          const heart = c.querySelector("button[aria-pressed]");
          if (!heart) return "missing heart";
          const ys = [
            c.querySelector("div.flex-wrap > *"),
            c.querySelector("time[data-listing-age]"),
            heart,
          ]
            .filter((e): e is Element => e !== null)
            .map(cy);
          return Math.max(...ys) - Math.min(...ys) <= 1.5
            ? "ok"
            : "not one line";
        }),
      )
      .toBe("ok");
  });

  test("food detail: back, share and favourite share one row (slide 6)", async ({
    page,
  }) => {
    await openFirstDetail(page, "/food");
    await expect
      .poll(() =>
        page.locator("main").evaluate(
          (main, s) => {
            const shown = (e: Element) => e.getClientRects().length > 0;
            const back = Array.from(main.querySelectorAll("button")).find(
              (b) => b.textContent?.trim() === s.BACK,
            );
            const share = Array.from(
              main.querySelectorAll(`button[aria-label="${s.SHARE}"]`),
            ).find(shown);
            const heart = Array.from(
              main.querySelectorAll(`button[aria-label="${s.FAVOURITE}"]`),
            ).find(shown);
            const gallery = main.querySelector("[data-mobile-gallery]");
            if (!back || !share || !heart || !gallery) return "missing";
            const rects = [back, share, heart].map((e) =>
              e.getBoundingClientRect(),
            );
            const ys = rects.map((r) => r.top + r.height / 2);
            if (Math.max(...ys) - Math.min(...ys) > 1.5) return "not one row";
            const bottom = Math.max(...rects.map((r) => r.bottom));
            return bottom <= gallery.getBoundingClientRect().top + 0.5
              ? "ok"
              : "overlaps the gallery";
          },
          { BACK, SHARE, FAVOURITE },
        ),
      )
      .toBe("ok");
  });

  for (const path of ["/", "/transport"]) {
    test(`service cards on ${path}: Call stays on one line, Details is not cut off (slide 7)`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator("[data-service-card]").first()).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const problems: string[] = [];
            for (const card of Array.from(
              document.querySelectorAll("[data-service-card]"),
            )) {
              const call = card.querySelector('[data-slot="call-button"]');
              if (!call || call.getClientRects().length === 0) continue;
              const name = card.getAttribute("aria-label");
              const label = Array.from(call.querySelectorAll("span")).find(
                (s) => s.getClientRects().length > 0,
              );
              if (label && (window as LinesWindow).__textLines(label) > 1)
                problems.push(`Call wraps on "${name}"`);
              const details = call.parentElement?.querySelector("a");
              const text = details?.querySelector("span") ?? details;
              if (text && text.scrollWidth > text.clientWidth + 0.5)
                problems.push(`Details cut off on "${name}"`);
            }
            return problems.join("; ") || "ok";
          }),
        )
        .toBe("ok");
    });
  }
});
