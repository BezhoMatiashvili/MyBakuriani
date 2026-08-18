import assert from "node:assert/strict";
import test from "node:test";

import { getVerifiedSessionUser } from "../src/lib/auth/verified-session-user.ts";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
};

function auth({
  subject = user.id,
  email = "signed@example.com",
  claimsError = null,
  claimsThrows = false,
  sessionUser = user,
  sessionThrows = false,
} = {}) {
  let sessionReads = 0;
  return {
    verifier: {
      async getClaims() {
        if (claimsThrows) throw new Error("claims unavailable");
        return {
          data: subject === null
            ? { claims: null }
            : { claims: { sub: subject, email } },
          error: claimsError,
        };
      },
      async getSession() {
        sessionReads += 1;
        if (sessionThrows) throw new Error("session unavailable");
        return { data: { session: sessionUser ? { user: sessionUser } : null } };
      },
    },
    sessionReads: () => sessionReads,
  };
}

test("returns only signed identity fields when claims match the session", async () => {
  const fixture = auth({
    sessionUser: {
      ...user,
      email: "attacker-edited@example.com",
      user_metadata: { role: "admin" },
    },
  });
  assert.deepEqual(await getVerifiedSessionUser(fixture.verifier), {
    id: user.id,
    email: "signed@example.com",
  });
  assert.equal(fixture.sessionReads(), 1);
});

test("rejects missing or failed claims without reading the unverified session", async () => {
  for (const fixture of [
    auth({ subject: null }),
    auth({ claimsError: new Error("JWKS unavailable") }),
  ]) {
    assert.equal(await getVerifiedSessionUser(fixture.verifier), null);
    assert.equal(fixture.sessionReads(), 0);
  }
});

test("fails closed when claims or session verification throws", async () => {
  const claimsFailure = auth({ claimsThrows: true });
  assert.equal(await getVerifiedSessionUser(claimsFailure.verifier), null);
  assert.equal(claimsFailure.sessionReads(), 0);

  const sessionFailure = auth({ sessionThrows: true });
  assert.equal(await getVerifiedSessionUser(sessionFailure.verifier), null);
  assert.equal(sessionFailure.sessionReads(), 1);
});

test("rejects a session whose embedded user does not match the signed subject", async () => {
  const fixture = auth({
    sessionUser: { ...user, id: "22222222-2222-4222-8222-222222222222" },
  });
  assert.equal(await getVerifiedSessionUser(fixture.verifier), null);
  assert.equal(fixture.sessionReads(), 1);
});

test("rejects a missing cookie session even when claims are valid", async () => {
  const fixture = auth({ sessionUser: null });
  assert.equal(await getVerifiedSessionUser(fixture.verifier), null);
});
