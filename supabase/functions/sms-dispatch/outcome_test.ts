import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import type { UbillSendReply } from "../_shared/ubill.ts";
import { classifyReply } from "./outcome.ts";

const reply = (r: Partial<UbillSendReply>): UbillSendReply => ({
  http: 200,
  parsed: true,
  statusID: 0,
  smsID: 5040001,
  message: null,
  ...r,
});

Deno.test("accepted with an id = submitted", () => {
  assertEquals(classifyReply(reply({})), {
    kind: "submitted",
    smsId: "5040001",
  });
  assertEquals(classifyReply(reply({ smsID: "abc" })), {
    kind: "submitted",
    smsId: "abc",
  });
});

Deno.test(
  "a reply that may follow a sent text is unknown, never retried",
  () => {
    for (const r of [
      reply({ parsed: false, statusID: null, smsID: null }), // unreadable 2xx
      reply({ statusID: null, smsID: null }), // JSON without a statusID (not 0!)
      reply({ smsID: null }), // accepted, no id to follow
      reply({ http: 502, parsed: false, statusID: null, smsID: null }),
      reply({ http: 500, statusID: null, smsID: null }),
    ])
      assertEquals(classifyReply(r).kind, "unknown", JSON.stringify(r));
  },
);

Deno.test("a definite refusal is released for a later retry", () => {
  for (const r of [
    reply({ statusID: 10, smsID: null, message: "no balance" }),
    reply({ http: 401, parsed: false, statusID: null, smsID: null }),
    reply({ http: 429, statusID: null, smsID: null }),
    reply({ http: 503, statusID: 30, smsID: null }),
  ])
    assertEquals(classifyReply(r).kind, "refused", JSON.stringify(r));
});

Deno.test("an invalid number fails the row only", () => {
  for (const statusID of [20, 50]) {
    assertEquals(
      classifyReply(reply({ statusID, smsID: null })).kind,
      "failed",
    );
    assertEquals(
      classifyReply(reply({ http: 400, statusID, smsID: null })).kind,
      "failed",
    );
  }
});
