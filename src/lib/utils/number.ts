/**
 * Numeric input helpers — single source of truth for the validation/limiting
 * rules applied by NumberField and the various hand-rolled numeric controls.
 *
 * All form state in this codebase is stored as strings (`useState("")`), so the
 * helpers operate on strings and return strings/numbers without forcing a state
 * type change at the call sites.
 */

export interface SanitizeOptions {
  allowNegative?: boolean;
  allowDecimal?: boolean;
}

/**
 * Strip everything that isn't part of a valid number *while typing*. Keeps
 * intermediate states like "12." or a lone "-" so the field stays editable;
 * final correctness is enforced by clampNumber() on blur/submit.
 */
export function sanitizeNumericString(
  raw: string,
  { allowNegative = false, allowDecimal = false }: SanitizeOptions = {},
): string {
  if (!raw) return "";
  let s = raw.replace(allowDecimal ? /[^0-9.\-]/g : /[^0-9\-]/g, "");

  const negative = allowNegative && s.startsWith("-");
  s = s.replace(/-/g, "");

  if (allowDecimal) {
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
      // collapse any further dots
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
  }

  return (negative ? "-" : "") + s;
}

/** Parse a numeric string to a finite number, or null if empty/invalid. */
export function parseNumeric(value: string): number | null {
  if (value == null || value.trim() === "" || value === "-" || value === ".") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface ClampOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  /** Round to this many decimal places (ignored when integer is true). */
  decimals?: number;
}

/** Round (integer/decimals) then clamp into [min, max]. */
export function clampNumber(
  n: number,
  { min, max, integer, decimals }: ClampOptions = {},
): number {
  let v = n;
  if (integer) {
    v = Math.round(v);
  } else if (typeof decimals === "number") {
    const factor = 10 ** decimals;
    v = Math.round(v * factor) / factor;
  }
  if (typeof min === "number" && v < min) v = min;
  if (typeof max === "number" && v > max) v = max;
  return v;
}

/**
 * Clamp a numeric string and return it as a string. Empty/invalid input returns
 * "" so required-field checks still see an empty value.
 */
export function clampNumericString(
  value: string,
  opts: ClampOptions = {},
): string {
  const n = parseNumeric(value);
  if (n === null) return "";
  return String(clampNumber(n, opts));
}

/**
 * A Georgian mobile number: exactly 9 digits, leading "5" (the value stored by
 * PhoneInput, without the +995 prefix).
 */
export function isValidGePhone(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^5\d{8}$/.test(value.replace(/\D/g, ""));
}

/**
 * Normalize a stored phone (e.g. "+995599123456", "599123456", or legacy
 * garbage) down to the bare 9-digit local form that PhoneInput expects when
 * seeding a field for editing. Drops a leading "995" country code and caps at
 * 9 digits so over-long legacy values stay editable rather than blank.
 */
export function toLocalGePhone(value: string | null | undefined): string {
  if (!value) return "";
  let d = value.replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("995")) d = d.slice(3);
  return d.slice(0, 9);
}

/** Georgian personal ID: exactly 11 digits. */
export function isValidPersonalId(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{11}$/.test(value.replace(/\D/g, ""));
}

/**
 * A Georgian cadastral code (e.g. "01.10.05.123"): digits and dots only, with
 * at least one dot and at least one digit.
 */
export function isValidCadastralCode(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  return /^[0-9.]+$/.test(value) && value.includes(".") && /\d/.test(value);
}

/** Keep only digits and dots while typing a cadastral code (e.g. "01.10.05.123"). */
export function sanitizeCadastralCode(raw: string): string {
  return raw.replace(/[^0-9.]/g, "");
}
