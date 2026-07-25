import { pathToFileURL } from "node:url";

const ORIGIN_PATTERN = /^https?:\/\//;

function isExactOrigin(value) {
  if (!ORIGIN_PATTERN.test(value)) return false;

  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function readAllowedOrigins(raw) {
  if (!raw?.trim()) {
    return { origins: [], errors: ["ALLOWED_ORIGINS must be set."] };
  }

  const origins = raw.split(",").map((value) => value.trim());
  const invalidOrigins = origins.filter((origin) => !isExactOrigin(origin));

  return {
    origins,
    errors: invalidOrigins.length
      ? [
          `ALLOWED_ORIGINS contains invalid exact origin${
            invalidOrigins.length === 1 ? "" : "s"
          }: ${invalidOrigins.map((origin) => JSON.stringify(origin)).join(", ")}.`,
        ]
      : [],
  };
}

/**
 * Validate variables required for cookie-authenticated mutations on Vercel
 * Production. Kept dependency-free so this can run before `next build`.
 */
export function validateProductionConfig(env = process.env) {
  if (env.VERCEL_ENV !== "production") return [];

  const { origins, errors } = readAllowedOrigins(env.ALLOWED_ORIGINS);
  const canonicalOrigin = env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!canonicalOrigin) {
    errors.push(
      "NEXT_PUBLIC_SITE_URL must be set to the canonical site origin.",
    );
  } else if (!isExactOrigin(canonicalOrigin)) {
    errors.push(
      "NEXT_PUBLIC_SITE_URL must be a valid exact origin (for example, https://my-bakuriani.vercel.app).",
    );
  } else if (!origins.includes(canonicalOrigin)) {
    errors.push(
      "ALLOWED_ORIGINS must include the exact NEXT_PUBLIC_SITE_URL origin.",
    );
  }

  // Turnstile and Upstash are deliberately NOT required. They were, briefly,
  // and it failed the production build — but the deeper problem was that the
  // app treated "unconfigured" as "deny", which had already taken every
  // rate-limited route offline. The limiter is now Postgres-backed and Turnstile
  // is gated at its call site, so both are genuine opt-in upgrades and must not
  // become build blockers again.
  return errors;
}

export function assertProductionConfig(env = process.env) {
  const errors = validateProductionConfig(env);
  if (errors.length) {
    throw new Error(
      `Invalid Vercel Production configuration:\n- ${errors.join("\n- ")}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    assertProductionConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
