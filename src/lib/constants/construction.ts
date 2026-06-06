// Shared source of truth for construction work-stages, the derived progress
// percent, update-status options, and the unit-sales breakdown used by the
// seller "objects / projects" card and the construction-management dialog.

export interface ConstructionStage {
  key: string;
  label: string;
  weight: number; // weights across all stages sum to 100
}

// Order matters: the first four stages sum to 45 (matches the design's
// "4 checked → 45%"). Weights total 100.
export const CONSTRUCTION_STAGES: readonly ConstructionStage[] = [
  { key: "permit", label: "მშენებლობის ნებართვა", weight: 5 },
  { key: "earthworks", label: "მიწის სამუშაოები", weight: 5 },
  { key: "foundation", label: "საძირკველი", weight: 10 },
  { key: "rc_frame", label: "რკინა-ბეტონის კარკასი", weight: 25 },
  { key: "walls", label: "გარე და შიდა კედლები", weight: 12 },
  { key: "roofing", label: "გადახურვა", weight: 10 },
  { key: "windows_doors", label: "ფანჯრები / კარები", weight: 8 },
  { key: "utilities", label: "კომუნიკაციები (ელ. წყალი)", weight: 10 },
  { key: "finishing", label: "მოპირკეთება (ლიფტი/კიბე)", weight: 10 },
  { key: "commissioning", label: "ექსპლუატაციაში მიღება", weight: 5 },
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

// Status of the construction/progress update (used in the dialog dropdown).
export const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "on_schedule", label: "მიმდინარეობს გრაფიკით" },
  { value: "delayed", label: "შეფერხებით" },
  { value: "paused", label: "შეჩერებულია" },
  { value: "completed", label: "დასრულდა" },
];

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
