// Classify every route as fully-clean / partial / fully-blocked based on
// httpStatus per viewport, and print a reviewer-ready annotation.
import { readFile } from "node:fs/promises";

const d = JSON.parse(
  await readFile("responsive-audit/diagnostics.json", "utf-8"),
);
const isBad = (diag) =>
  "error" in diag || (diag.httpStatus && diag.httpStatus >= 400);

const buckets = { clean: [], partial: [], blocked: [] };
for (const r of d.results) {
  if (r.label === "404") continue; // intentional 404 test route
  const vps = Object.entries(r.diagnostics);
  const bad = vps.filter(([, diag]) => isBad(diag)).map(([vp]) => vp);
  const good = vps.filter(([, diag]) => !isBad(diag)).map(([vp]) => vp);
  const entry = { ...r, good, bad };
  if (bad.length === 0) buckets.clean.push(entry);
  else if (good.length === 0) buckets.blocked.push(entry);
  else buckets.partial.push(entry);
}

console.log(
  `clean: ${buckets.clean.length}, partial: ${buckets.partial.length}, blocked: ${buckets.blocked.length}`,
);
console.log();

if (process.argv[2] === "partial") {
  for (const r of buckets.partial) {
    console.log(
      `${r.label} (${r.route}): REVIEW=[${r.good.join(",")}] SKIP-504=[${r.bad.join(",")}]`,
    );
  }
} else if (process.argv[2] === "blocked") {
  for (const r of buckets.blocked) console.log(`${r.label} (${r.route})`);
} else if (process.argv[2] === "clean") {
  for (const r of buckets.clean) console.log(`${r.label} (${r.route})`);
}
