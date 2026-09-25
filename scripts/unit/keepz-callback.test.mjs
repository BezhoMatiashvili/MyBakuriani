import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callbackOrderId,
  parseCallbackFields,
} from "../../src/lib/payments/keepz/callback-body.ts";

const ID = "3FA85F64-5717-4562-B3FC-2C963F66AFA6";

test("JSON callbacks yield their fields and a normalized order id", () => {
  const fields = parseCallbackFields(
    JSON.stringify({ integratorOrderId: ID, status: "SUCCESS", amount: 10 }),
    "application/json; charset=utf-8",
  );
  assert.equal(fields.status, "SUCCESS");
  assert.equal(callbackOrderId(fields), ID.toLowerCase());
});

test("form-encoded callbacks are read too, first value wins", () => {
  const fields = parseCallbackFields(
    `integratorOrderId=${ID}&status=SUCCESS&status=FAILED`,
    "application/x-www-form-urlencoded",
  );
  assert.equal(fields.status, "SUCCESS");
  assert.equal(callbackOrderId(fields), ID.toLowerCase());
  // Same body with no content type is still recognized as a form.
  assert.equal(
    callbackOrderId(parseCallbackFields(`integratorOrderId=${ID}`, "")),
    ID.toLowerCase(),
  );
});

test('a form-encoded envelope keeps its base64 "+" characters', () => {
  const fields = parseCallbackFields(
    "encryptedData=ab+cd==&encryptedKeys=ef+gh&aes=true",
    "application/x-www-form-urlencoded",
  );
  assert.equal(fields.encryptedData, "ab+cd==");
  assert.equal(fields.encryptedKeys, "ef+gh");
});

test("an encrypted envelope is passed through untouched for decryption", () => {
  const envelope = { encryptedData: "AAAA", encryptedKeys: "BBBB", aes: true };
  assert.deepEqual(
    parseCallbackFields(JSON.stringify(envelope), "application/json"),
    envelope,
  );
});

test("garbage, arrays and non-UUID ids never produce an order id", () => {
  for (const [raw, type] of [
    ["", "application/json"],
    ["not json", "application/json"],
    ["[1,2,3]", "application/json"],
    ["null", "application/json"],
    [JSON.stringify({ integratorOrderId: "1 OR 1=1" }), "application/json"],
    [JSON.stringify({ integratorOrderId: 42 }), "application/json"],
    [JSON.stringify({ orderId: ID }), "application/json"],
  ]) {
    assert.equal(callbackOrderId(parseCallbackFields(raw, type)), null);
  }
});

test("__proto__ keys cannot pollute object prototypes", () => {
  const form = parseCallbackFields(
    "__proto__=polluted&integratorOrderId=x",
    "application/x-www-form-urlencoded",
  );
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(form), Object.prototype);
  const json = parseCallbackFields(
    '{"__proto__":{"polluted":true},"integratorOrderId":"x"}',
    "application/json",
  );
  assert.equal({}.polluted, undefined);
  assert.equal(callbackOrderId(json), null);
});
