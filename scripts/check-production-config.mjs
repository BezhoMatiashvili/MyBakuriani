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

const REQUIRED_PUBLIC_CONTACT_ENV = [
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

/**
 * Validate variables required for cookie-authenticated mutations on Vercel
 * Production. Kept dependency-free so this can run before `next build`.
 */
export function validateProductionConfig(env = process.env) {
  if (env.VERCEL_ENV !== "production") return [];

  const { origins, errors } = readAllowedOrigins(env.ALLOWED_ORIGINS);
  const canonicalOrigin = env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!canonicalOrigin) {
    errors.push("NEXT_PUBLIC_SITE_URL must be set to the canonical site origin.");
  } else if (!isExactOrigin(canonicalOrigin)) {
    errors.push(
      "NEXT_PUBLIC_SITE_URL must be a valid exact origin (for example, https://my-bakuriani.vercel.app).",
    );
  } else if (!origins.includes(canonicalOrigin)) {
    errors.push(
      "ALLOWED_ORIGINS must include the exact NEXT_PUBLIC_SITE_URL origin.",
    );
  }

  for (const name of REQUIRED_PUBLIC_CONTACT_ENV) {
    if (!env[name]?.trim()) {
      errors.push(`${name} must be set for public contact reveals.`);
    }
  }

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
