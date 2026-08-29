import assert from "node:assert/strict";
import test from "node:test";

import { isAal2Verified } from "../src/lib/auth/mfa-assurance.ts";

function auth({ currentLevel = "aal2", data = undefined, error = null } = {}) {
  return {
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        return {
          data: data !== undefined ? data : { currentLevel },
          error,
        };
      },
    },
  };
}

test("resolves true when currentLevel is aal2", async () => {
  assert.equal(await isAal2Verified(auth({ currentLevel: "aal2" })), true);
});

test("resolves false when currentLevel is aal1", async () => {
  assert.equal(await isAal2Verified(auth({ currentLevel: "aal1" })), false);
});

test("resolves false when currentLevel is null", async () => {
  assert.equal(await isAal2Verified(auth({ currentLevel: null })), false);
});

test("resolves false when data is null", async () => {
  assert.equal(await isAal2Verified(auth({ data: null })), false);
});

test("fails closed when the call never settles within the timeout", async () => {
  const neverSettles = {
    mfa: {
      getAuthenticatorAssuranceLevel() {
        return new Promise(() => {});
      },
    },
  };
  assert.equal(await isAal2Verified(neverSettles, 5), false);
});
