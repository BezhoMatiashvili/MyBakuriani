// Shared source of truth for construction work-stages, the derived progress
// percent, update-status options, and the unit-sales breakdown used by the
// seller "objects / projects" card and the construction-management dialog.

export interface ConstructionStage {
  key: string;
  weight: number; // weights across all stages sum to 100
}

// Order matters: the first four stages sum to 45 (matches the design's
// "4 checked → 45%"). Weights total 100. Labels live in messages under
// SellerDashboard.constructionModal.stages.<key>.
export const CONSTRUCTION_STAGES: readonly ConstructionStage[] = [
  { key: "permit", weight: 5 },
  { key: "earthworks", weight: 5 },
  { key: "foundation", weight: 10 },
  { key: "rc_frame", weight: 25 },
  { key: "walls", weight: 12 },
  { key: "roofing", weight: 10 },
  { key: "windows_doors", weight: 8 },
  { key: "utilities", weight: 10 },
  { key: "finishing", weight: 10 },
  { key: "commissioning", weight: 5 },
];

/** Derive the construction progress percent (0–100) from completed stage keys. */
export function percentFromStages(keys: readonly string[]): number {
  const completed = new Set(keys);
  const sum = CONSTRUCTION_STAGES.reduce(
    (acc, s) => (completed.has(s.key) ? acc + s.weight : acc),
    0,
  );
  return Math.min(100, Math.round(sum));
}

/**
 * Fallback for opening the dialog on a project that has a stored
 * `construction_progress_percent` but no `construction_stages` yet:
 * pre-select stages whose cumulative weight stays within the stored percent.
 */
export function stagesUpToPercent(percent: number): string[] {
  const keys: string[] = [];
  let running = 0;
  for (const s of CONSTRUCTION_STAGES) {
    running += s.weight;
    if (running <= percent) keys.push(s.key);
    else break;
  }
  return keys;
}

export interface UnitsLike {
  units_total: number | null;
  units_sold: number | null;
  units_reserved: number | null;
}

export interface UnitsBreakdown {
  total: number;
  sold: number;
  reserved: number;
  free: number;
  soldPct: number; // (sold + reserved) / total, rounded
}

/** Single accessor for the card's sales-progress bar. total === 0 → no bar. */
export function getUnitsBreakdown(p: UnitsLike): UnitsBreakdown {
  const total = p.units_total ?? 0;
  const sold = Math.max(0, p.units_sold ?? 0);
  const reserved = Math.max(0, p.units_reserved ?? 0);
  const taken = Math.min(sold + reserved, total);
  const free = Math.max(total - taken, 0);
  const soldPct = total > 0 ? Math.round((taken / total) * 100) : 0;
  return { total, sold, reserved, free, soldPct };
}
