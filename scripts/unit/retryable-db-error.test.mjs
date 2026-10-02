import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableDbError, withRetry } from "../../src/lib/with-timeout.ts";

// postgrest-js resolves `{ data, error }` for a failed request: a network failure,
// a timeoutFetch abort or a gateway page gets no `code`; anything PostgREST or
// Postgres answered carries one. The server render is held to ~10 s (a
// timeoutFetch aborts at 9.5 s), so only a failure that comes back fast is worth
// a second try.

test("a quick failure with no code is a blip and is retried", () => {
  for (const error of [
    { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" },
    { message: "<html>502 Bad Gateway</html>" },
    "connection reset",
  ]) {
    assert.equal(isRetryableDbError(error), true, JSON.stringify(error));
  }
});

test("errors that come back fast and clear on their own are retried", () => {
  for (const code of [
    "57P01", // admin shutdown
    "57P03", // cannot connect now
    "40001", // serialization failure
    "40P01", // deadlock
    "08006", // connection failure
    "53300", // too many connections
    "PGRST000", // could not connect with the database
    "PGRST001", // internal connection error
    "PGRST002", // schema cache not loaded yet
  ]) {
    assert.equal(isRetryableDbError({ code, message: "x" }), true, code);
  }
});

test("a slow failure is not retried: it has already spent the request budget", () => {
  for (const error of [
    // timeoutFetch's own abort: no code, this exact message
    {
      message: "TimeoutError: fetch timed out after 9500ms",
      details: "",
      hint: "",
      code: "",
    },
    { code: "57014", message: "canceling statement due to statement timeout" },
    { code: "PGRST003", message: "Timed out acquiring connection" },
  ]) {
    assert.equal(isRetryableDbError(error), false, JSON.stringify(error));
  }
});

test("a definitive answer is not retried", () => {
  for (const code of [
    "PGRST202", // the function does not exist (a deploy ahead of its migration)
    "PGRST301", // JWT expired
    "42501", // permission denied
    "42883", // undefined function
    "42P01", // undefined table
    "22023", // invalid parameter value
    "23505", // unique violation
    "P0001", // raise exception
  ]) {
    assert.equal(isRetryableDbError({ code, message: "x" }), false, code);
  }
});

test("withRetry asks once for a definitive failure or a timeout and twice for a blip", async () => {
  let definitive = 0;
  const first = await withRetry(async () => {
    definitive += 1;
    return { error: { code: "PGRST202", message: "no such function" } };
  }, isRetryableDbError);
  assert.equal(definitive, 1);
  assert.equal(first.error.code, "PGRST202");

  let slow = 0;
  const timedOut = await withRetry(async () => {
    slow += 1;
    return {
      error: {
        code: "",
        message: "TimeoutError: fetch timed out after 9500ms",
      },
    };
  }, isRetryableDbError);
  assert.equal(slow, 1);
  assert.equal(timedOut.error.code, "");

  let blip = 0;
  const second = await withRetry(async () => {
    blip += 1;
    return blip === 1
      ? { error: { code: "", message: "TypeError: Failed to fetch" } }
      : { error: null, data: "ok" };
  }, isRetryableDbError);
  assert.equal(blip, 2);
  assert.equal(second.data, "ok");
});
