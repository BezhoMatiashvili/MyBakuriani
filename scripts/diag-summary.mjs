// Print a compact diagnostics summary for a list of route labels (argv).
import { readFile } from "node:fs/promises";

const d = JSON.parse(
  await readFile("responsive-audit/diagnostics.json", "utf-8"),
);
const byLabel = new Map(d.results.map((r) => [r.label, r]));

for (const label of process.argv.slice(2)) {
  const r = byLabel.get(label);
  if (!r) {
    console.log(`${label}: NOT FOUND`);
    continue;
  }
  const parts = [];
  for (const [vp, diag] of Object.entries(r.diagnostics)) {
    if ("error" in diag) {
      parts.push(`${vp}=ERROR`);
      continue;
    }
    const bits = [];
    if (diag.overflow) bits.push(`OVERFLOW+${diag.overflowAmount}px`);
    if (diag.smallTouchTargetCount)
      bits.push(`${diag.smallTouchTargetCount} small targets`);
    if (diag.httpStatus && diag.httpStatus >= 400)
      bits.push(`HTTP ${diag.httpStatus}`);
    parts.push(`${vp}=${bits.length ? bits.join(",") : "ok"}`);
  }
  const errs = (r.consoleErrors || []).slice(0, 2);
  console.log(
    `${r.route} (${label}): ${parts.join("; ")}${errs.length ? " | console: " + JSON.stringify(errs) : ""}`,
  );
}
