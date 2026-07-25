import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductionConfig,
  validateProductionConfig,
} from "./check-production-config.mjs";

const canonicalOrigin = "https://my-bakuriani.vercel.app";
const publicContactEnv = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret-key",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token",
};

test("accepts an exact allowed canonical origin in Vercel Production", () => {
  assert.deepEqual(
    validateProductionConfig({
      VERCEL_ENV: "production",
      ALLOWED_ORIGINS: canonicalOrigin,
      NEXT_PUBLIC_SITE_URL: canonicalOrigin,
      ...publicContactEnv,
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
        ...publicContactEnv,
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
        ...publicContactEnv,
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
        ...publicContactEnv,
      }),
    /must include the exact NEXT_PUBLIC_SITE_URL origin/,
  );
});

test("rejects missing public-contact abuse protections", () => {
  assert.throws(
    () =>
      assertProductionConfig({
        VERCEL_ENV: "production",
        ALLOWED_ORIGINS: canonicalOrigin,
        NEXT_PUBLIC_SITE_URL: canonicalOrigin,
      }),
    /NEXT_PUBLIC_TURNSTILE_SITE_KEY must be set for public contact reveals/,
  );
});
