/**
 * Small, dependency-free boundary validators for values that eventually become
 * browser navigation targets or exported spreadsheet data.  Keep these checks
 * at both write and render boundaries: old database rows are untrusted too.
 */
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

const DEFAULT_ORIGIN = "https://my-bakuriani.vercel.app";

/** Exact, deployment-controlled origins only. No wildcard or suffix matching. */
export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.APP_ORIGIN;
  if (!raw) return process.env.NODE_ENV === "production" ? [] : [DEFAULT_ORIGIN, "http://localhost:3000"];
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => {
      try {
        return new URL(origin).origin === origin && /^https?:\/\//.test(origin);
      } catch {
        return false;
      }
    });
}

/** Cookie-authenticated unsafe requests must come from an explicitly allowed UI. */
export function isAllowedMutationOrigin(origin: string | null): boolean {
  return !!origin && allowedOrigins().includes(origin.replace(/\/$/, ""));
}

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || CONTROL_OR_BACKSLASH.test(value)) return null;

  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      CONTROL_OR_BACKSLASH.test(decoded)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return value;
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL_OR_BACKSLASH.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A Storage URL must be an HTTPS object URL from our configured Supabase project. */
export function safeStorageImageUrl(value: unknown): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) return null;
  try {
    const expected = new URL(projectUrl);
    const actual = new URL(safe);
    return actual.origin === expected.origin &&
      /^\/storage\/v1\/object\/(public|sign)\//.test(actual.pathname)
      ? safe
      : null;
  } catch {
    return null;
  }
}

/** Only normalized Georgian mobile numbers are emitted in tel/WhatsApp URLs. */
export function normalizeE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  const local = digits.startsWith("995") ? digits.slice(3) : digits;
  return /^5\d{8}$/.test(local) ? `+995${local}` : null;
}

export function safeCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r\n?|\n/g, "\n");
  const neutralized = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}
