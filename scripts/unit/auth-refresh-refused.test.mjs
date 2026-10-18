import assert from "node:assert/strict";
import test from "node:test";

import { createServerClient } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";

import {
  isTransientAuthFailure,
  refusalAwareFetch,
} from "../../src/lib/with-timeout.ts";

// Hosted Auth refuses /auth/v1/token with 429 once the app's egress address has
// spent its token bucket (every server-side refresh leaves from that one
// address). auth-js treats a refused refresh as a sign-out and asks for the
// auth cookie to be emptied, so a drained bucket used to delete returning
// users' sessions. These tests run the real @supabase/ssr client against a stub
// Auth server and a cookie jar, exactly as createClient() and updateSession()
// are wired.

const REF = "testprojectref";
const USER_ID = "00000000-0000-4000-8000-000000000000";
const COOKIE = {
  name: `sb-${REF}-auth-token`,
  value:
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: "a.b.c",
        refresh_token: "refresh-token",
        expires_at: 1,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: USER_ID },
      }),
    ).toString("base64url"),
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const answers = {
  refused: () =>
    json(429, {
      code: 429,
      error_code: "over_request_rate_limit",
      msg: "Request rate limit reached",
    }),
  refusedPlainText: () =>
    new Response("Too Many Requests", {
      status: 429,
      headers: { "content-type": "text/plain" },
    }),
  invalid: () =>
    json(400, {
      code: 400,
      error_code: "validation_failed",
      msg: "refresh token invalid",
    }),
  ok: () =>
    json(200, {
      access_token: "n.e.w",
      refresh_token: "new-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: USER_ID },
    }),
};

// One request of a server client, wired like server.ts / middleware.ts: the
// wrapped fetch, and a setAll that consults the wrapper before it writes.
async function run(answer, call = "getUser") {
  const posts = [];
  const writes = [];
  const refusal = refusalAwareFetch(async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) {
      posts.push(url);
      return answers[answer]();
    }
    return json(200, { id: USER_ID, aud: "authenticated" });
  });
  const supabase = createServerClient(`https://${REF}.supabase.co`, "anon", {
    global: { fetch: refusal.fetch },
    cookieOptions: { path: "/", sameSite: "lax", secure: true },
    cookies: {
      getAll: () => [COOKIE],
      setAll(list) {
        if (refusal.dropsDeletion(list)) return;
        list.forEach((c) => writes.push(c.value === "" ? "DELETE" : "SET"));
      },
    },
  });
  const { error } =
    call === "getUser"
      ? await supabase.auth.getUser()
      : await supabase.auth.getClaims();
  return { error, posts, writes };
}

for (const call of ["getUser", "getClaims"]) {
  test(`${call}: a refused refresh (JSON 429) keeps the session cookie and counts as transient`, async () => {
    const { error, posts, writes } = await run("refused", call);
    assert.equal(posts.length, 1);
    assert.equal(error?.status, 429);
    assert.equal(isTransientAuthFailure(error), true);
    assert.deepEqual(writes, []);
  });

  test(`${call}: a gateway's plain-text 429 reaches auth-js as the same 429 refusal`, async () => {
    const { error, posts, writes } = await run("refusedPlainText", call);
    assert.equal(posts.length, 1);
    assert.equal(error?.status, 429);
    assert.equal(error?.code, "over_request_rate_limit");
    assert.equal(isTransientAuthFailure(error), true);
    assert.deepEqual(writes, []);
  });

  test(`${call}: a definitive 400 still deletes the cookie and is not transient`, async () => {
    const { error, writes } = await run("invalid", call);
    assert.equal(error?.status, 400);
    assert.equal(isTransientAuthFailure(error), false);
    assert.deepEqual(writes, ["DELETE"]);
  });
}

test("a successful refresh still rewrites the cookie", async () => {
  const { error, writes } = await run("ok");
  assert.equal(error, null);
  assert.deepEqual(writes, ["SET"]);
});

test("a 429 from another Auth path or another host is passed through untouched", async () => {
  const refusal = refusalAwareFetch(
    async () => new Response("slow down", { status: 429 }),
  );
  const res = await refusal.fetch("https://x.supabase.co/rest/v1/profiles");
  assert.equal(res.status, 429);
  assert.equal(await res.text(), "slow down");
  assert.equal(refusal.dropsDeletion([{ name: "n", value: "" }]), false);
});

test("a JSON 429 from /auth/v1/token is returned as it came", async () => {
  const refusal = refusalAwareFetch(async () =>
    json(429, { code: 429, error_code: "over_request_rate_limit", msg: "m" }),
  );
  const res = await refusal.fetch(
    "https://x.supabase.co/auth/v1/token?grant_type=refresh_token",
  );
  assert.equal(res.status, 429);
  assert.equal((await res.json()).msg, "m");
});

test("only a batch of pure deletions is dropped, and only after a refusal", async () => {
  const refusal = refusalAwareFetch(async () => answers.refused());
  const del = [{ name: COOKIE.name, value: "" }];
  const mixed = [
    { name: COOKIE.name, value: "x" },
    { name: `${COOKIE.name}.1`, value: "" },
  ];
  assert.equal(refusal.dropsDeletion(del), false);
  await refusal.fetch(
    "https://x.supabase.co/auth/v1/token?grant_type=refresh_token",
  );
  assert.equal(refusal.dropsDeletion(del), true);
  assert.equal(refusal.dropsDeletion(mixed), false);
  assert.equal(refusal.dropsDeletion([]), false);
});

test("isTransientAuthFailure: 429 yes; other client errors still no", () => {
  const e = (status, code) => new AuthApiError("m", status, code);
  assert.equal(isTransientAuthFailure(e(429, "over_request_rate_limit")), true);
  assert.equal(
    isTransientAuthFailure(e(400, "refresh_token_already_used")),
    true,
  );
  assert.equal(isTransientAuthFailure(e(400, "validation_failed")), false);
  assert.equal(isTransientAuthFailure(e(401, "bad_jwt")), false);
  assert.equal(isTransientAuthFailure(e(403, "forbidden")), false);
  assert.equal(isTransientAuthFailure(e(500, "unexpected_failure")), true);
});
