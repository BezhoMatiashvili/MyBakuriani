import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductionConfig,
  validateProductionConfig,
} from "./check-production-config.mjs";

const canonicalOrigin = "https://my-bakuriani.vercel.app";

test("accepts an exact allowed canonical origin in Vercel Production", () => {
  assert.deepEqual(
    validateProductionConfig({
      VERCEL_ENV: "production",
      ALLOWED_ORIGINS: canonicalOrigin,
      NEXT_PUBLIC_SITE_URL: canonicalOrigin,
    }),
    [],
  );
});

test("does not activate outside Vercel Production", () => {
  assert.doesNotThrow(() =>
    assertProductionConfig({
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SITE_URL: canonicalOrigin,
    }),
  );
});

test("rejects a missing production allowed-origin list", () => {
  assert.throws(
    () =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: canonicalOrigin,
      }),
    /ALLOWED_ORIGINS must be set/,
  );
});

test("rejects malformed or non-exact allowed origins", () => {
  assert.throws(
    () =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        ALLOWED_ORIGINS: "https://my-bakuriani.vercel.app/",
        NEXT_PUBLIC_SITE_URL: canonicalOrigin,
      }),
    /contains invalid exact origin/,
  );
});

test("rejects an allowed-origin list that omits the canonical site origin", () => {
  assert.throws(
    () =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        ALLOWED_ORIGINS: "https://preview.my-bakuriani.vercel.app",
        NEXT_PUBLIC_SITE_URL: canonicalOrigin,
      }),
    /must include the exact NEXT_PUBLIC_SITE_URL origin/,
  );
});

test("treats Turnstile and Upstash as optional, not build blockers", () => {
  // Requiring these failed the production build, and the fail-closed behaviour
  // behind them had already taken every rate-limited route offline. The limiter
  // is Postgres-backed now; both are opt-in upgrades.
  assert.doesNotThrow(() =>
    assertProductionConfig({
      VERCEL_ENV: "production",
      ALLOWED_ORIGINS: canonicalOrigin,
      NEXT_PUBLIC_SITE_URL: canonicalOrigin,
    }),
  );
});

test("rejects invalid SMS feature modes and QA without an allowlist", () => {
  const base = {
    VERCEL_ENV: "production",
    ALLOWED_ORIGINS: canonicalOrigin,
    NEXT_PUBLIC_SITE_URL: canonicalOrigin,
  };
  assert.match(
    validateProductionConfig({ ...base, SMS_RENTAL_MODE: "maybe" }).join(" "),
    /SMS_RENTAL_MODE must be one of/,
  );
  assert.match(
    validateProductionConfig({ ...base, SMS_PRICE_DROP_MODE: "qa" }).join(" "),
    /requires SMS_QA_USER_IDS/,
  );
  assert.deepEqual(
    validateProductionConfig({
      ...base,
      SMS_RENTAL_MODE: "qa",
      SMS_PRICE_DROP_MODE: "off",
      SMS_QA_USER_IDS: "00000000-0000-0000-0000-000000000001",
    }),
    [],
  );
});
