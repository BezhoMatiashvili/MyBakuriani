// One-off consolidation: rebuild every contact sheet from whatever
// screenshot files actually exist on disk (across all audit attempts),
// and merge diagnostics.json + diagnostics.run1.json into one report that
// prefers non-error entries. Run after a multi-attempt sweep where later
// runs may have failed on routes earlier runs already captured.
import sharp from "sharp";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "responsive-audit";
const VIEWPORT_ORDER = [
  "mobile-s",
  "mobile-l",
  "tablet-p",
  "tablet-l",
  "laptop",
  "desktop",
];
const VIEWPORT_WIDTH = {
  "mobile-s": 375,
  "mobile-l": 428,
  "tablet-p": 768,
  "tablet-l": 1024,
  laptop: 1440,
  desktop: 1920,
};

async function buildContactSheet(label, shots) {
  const LABEL_H = 28;
  const metas = await Promise.all(
    shots.map(async (s) => ({
      ...s,
      meta: await sharp(s.filePath).metadata(),
    })),
  );
  const targetW = Math.max(...metas.map((m) => m.meta.width));
  const composites = [];
  let y = 0;
  for (const m of metas) {
    const scale = targetW / m.meta.width;
    const resizedH = Math.round(m.meta.height * scale);
    const labelText = `${m.vp} (${VIEWPORT_WIDTH[m.vp]}px)`;
    const svg = `<svg width="${targetW}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-family="sans-serif" font-size="16" fill="#0f0">${labelText}</text></svg>`;
    composites.push({ input: Buffer.from(svg), top: y, left: 0 });
    y += LABEL_H;
    composites.push({
      input: await sharp(m.filePath).resize({ width: targetW }).toBuffer(),
      top: y,
      left: 0,
    });
    y += resizedH;
  }
  const sheetPath = path.join(OUT_DIR, "sheets", `${label}.png`);
  await mkdir(path.dirname(sheetPath), { recursive: true });
  await sharp({
    create: { width: targetW, height: y, channels: 3, background: "#fff" },
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);
  return sheetPath;
}

async function main() {
  // Discover every label per viewport dir
  const byLabel = new Map(); // label -> [{vp, filePath}]
  for (const vp of VIEWPORT_ORDER) {
    const dir = path.join(OUT_DIR, "screenshots", vp);
    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".png")) continue;
      const label = f.slice(0, -4);
      if (!byLabel.has(label)) byLabel.set(label, []);
      byLabel.get(label).push({ vp, filePath: path.join(dir, f) });
    }
  }

  console.log(`Rebuilding sheets for ${byLabel.size} routes`);
  for (const [label, shots] of byLabel) {
    shots.sort(
      (a, b) => VIEWPORT_ORDER.indexOf(a.vp) - VIEWPORT_ORDER.indexOf(b.vp),
    );
    await buildContactSheet(label, shots);
  }
  console.log("Sheets rebuilt.");

  // Merge diagnostics: run1 (baseline, full 112 routes) + current (latest dashboard retry)
  const run1 = JSON.parse(
    await readFile(path.join(OUT_DIR, "diagnostics.run1.json"), "utf-8"),
  );
  const latest = JSON.parse(
    await readFile(path.join(OUT_DIR, "diagnostics.json"), "utf-8"),
  );

  const latestByLabel = new Map(latest.results.map((r) => [r.label, r]));
  const merged = run1.results.map((r1) => {
    const r2 = latestByLabel.get(r1.label);
    if (!r2) return r1;
    const diagnostics = { ...r1.diagnostics };
    for (const [vp, d2] of Object.entries(r2.diagnostics)) {
      const d1 = diagnostics[vp];
      const d2HasError = "error" in d2;
      const d1HasError = d1 && "error" in d1;
      // Prefer the entry without an error; if both/neither have one, prefer latest.
      if (!d2HasError || !d1 || d1HasError) {
        diagnostics[vp] = d2;
      }
    }
    const consoleErrors = [
      ...new Set([...(r1.consoleErrors || []), ...(r2.consoleErrors || [])]),
    ];
    return { ...r1, diagnostics, consoleErrors };
  });

  await writeFile(
    path.join(OUT_DIR, "diagnostics.json"),
    JSON.stringify(
      {
        baseUrl: run1.baseUrl,
        generatedAt: new Date().toISOString(),
        mergedFrom: ["run1", "dashboard-retries"],
        results: merged,
      },
      null,
      2,
    ),
  );

  const stillErrored = merged.filter((r) =>
    Object.values(r.diagnostics).some((d) => "error" in d),
  );
  console.log(
    `Merged diagnostics written. Routes with any remaining error entry: ${stillErrored.length}`,
  );
  for (const r of stillErrored) {
    const bad = Object.entries(r.diagnostics)
      .filter(([, d]) => "error" in d)
      .map(([vp]) => vp);
    console.log(
      ` - ${r.route} (${r.label}): missing diagnostics for [${bad.join(", ")}] — screenshot may still exist on disk`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
