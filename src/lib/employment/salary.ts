// Pure salary model for employment listings. No runtime "@/..." imports: the
// unit tests in scripts/unit/ load this file directly with Node's type
// stripping.

export type SalaryModel = "fixed" | "fixed_bonus" | "commission" | "negotiable";

// `services.salary_type` stores the Georgian label the create form offers
// (SALARY_TYPE_VALUES there, ListingOptions.salaryTypes for display).
const SALARY_MODEL_BY_LABEL: Record<string, SalaryModel> = {
  ფიქსირებული: "fixed",
  "ფიქსირებული + ბონუსი/Tips": "fixed_bonus",
  "გამომუშავებით (%)": "commission",
  შეთანხმებით: "negotiable",
};

const SALARY_MODELS: readonly SalaryModel[] = [
  "fixed",
  "fixed_bonus",
  "commission",
  "negotiable",
];

/** Stored salary type (Georgian label or the key itself) → model, else null. */
export function salaryModelOf(
  raw: string | null | undefined,
): SalaryModel | null {
  const value = raw?.trim();
  if (!value) return null;
  if (Object.hasOwn(SALARY_MODEL_BY_LABEL, value)) {
    return SALARY_MODEL_BY_LABEL[value];
  }
  return (SALARY_MODELS as readonly string[]).includes(value)
    ? (value as SalaryModel)
    : null;
}

export type SalaryDescriptor =
  | { kind: "range"; min: number; max: number }
  | { kind: "from"; min: number }
  | { kind: "upTo"; max: number }
  | { kind: "daily"; amount: number }
  | { kind: "model"; model: SalaryModel };

type Amount = number | string | null | undefined;

export interface SalaryFields {
  salary_type?: string | null;
  salary_min?: Amount;
  salary_max?: Amount;
  salary_daily?: Amount;
  salary_range?: string | null;
  price?: Amount;
}

/** A finite amount above zero, else null ("0 ₾" is never a salary). */
function positive(value: Amount): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The create form writes `salary_range` as "<min>-<max> ₾" next to the two
// numbers; older rows (and the e2e seed) carry only this text. Whole numbers
// only: "1,200-1,500" (admin free text) must not read as 1.2–1.5.
function parseRangeText(
  text: string | null | undefined,
): { min: number; max: number } | null {
  const match = text?.match(/^\s*(\d+)\s*[-–—]\s*(\d+)(?![\d.,])/);
  if (!match) return null;
  const min = positive(match[1]);
  const max = positive(match[2]);
  return min != null && max != null ? { min, max } : null;
}

/**
 * What a vacancy's salary line should say. Never "nothing": a row without a
 * usable amount falls back to its salary type, and to "negotiable" when even
 * that is unknown, so every card shows the same set of lines.
 */
export function describeSalary(row: SalaryFields): SalaryDescriptor {
  const model = salaryModelOf(row.salary_type);
  // These two types have no fixed amount; any min/max still stored on the row
  // is stale (the form used to keep them when the type changed).
  if (model === "commission" || model === "negotiable") {
    return { kind: "model", model };
  }

  const min = positive(row.salary_min);
  const max = positive(row.salary_max);
  if (min != null && max != null) return { kind: "range", min, max };
  if (min != null) return { kind: "from", min };
  if (max != null) return { kind: "upTo", max };

  const daily = positive(row.salary_daily);
  if (daily != null) return { kind: "daily", amount: daily };

  const rangeText = parseRangeText(row.salary_range);
  if (rangeText) return { kind: "range", ...rangeText };

  // `price` is not written by the employment form; legacy rows showed it as a
  // single amount, which a range with equal ends renders as.
  const price = positive(row.price);
  if (price != null) return { kind: "range", min: price, max: price };

  return { kind: "model", model: model ?? "negotiable" };
}
