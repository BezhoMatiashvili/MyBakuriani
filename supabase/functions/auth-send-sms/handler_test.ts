import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { AUTH_SMS_ERRORS } from "../_shared/auth-sms.ts";
import type { UbillSendReply } from "../_shared/ubill.ts";
import {
  handleSendSms,
  type HookDeps,
  type Reservation,
  SEND_TIMEOUT_MS,
} from "./handler.ts";

const BASE64_SECRET = btoa("0123456789abcdef0123456789abcdef");
const SECRET = `v1,whsec_${BASE64_SECRET}`;
const CODE = "482913";

const ENV: Record<string, string> = {
  SEND_SMS_HOOK_SECRET: SECRET,
  SMS_DELIVERY_ENABLED: "true",
  SMS_PROVIDER_API_KEY: "test-key",
  SMS_PROVIDER_BRAND_ID: "1",
  SITE_URL: "https://mybakuriani.ge",
};

interface Calls {
  reserve: Parameters<HookDeps["reserve"]>[0][];
  settle: [string, boolean, string | null][];
  send: Parameters<HookDeps["send"]>[0][];
  logs: string[];
}

function deps(
  opts: {
    env?: Record<string, string | undefined>;
    reservation?: Reservation;
    reply?: UbillSendReply | Error;
  } = {},
): { deps: HookDeps; calls: Calls } {
  const calls: Calls = { reserve: [], settle: [], send: [], logs: [] };
  const env = { ...ENV, ...opts.env };
  return {
    calls,
    deps: {
      env: (name) => env[name],
      reserve: (args) => {
        calls.reserve.push(args);
        return Promise.resolve(opts.reservation ?? { ok: true, id: "row-1" });
      },
      settle: (id, sent, smsId) => {
        calls.settle.push([id, sent, smsId]);
        return Promise.resolve();
      },
      send: (o) => {
        calls.send.push(o);
        const reply = opts.reply ?? {
          http: 200,
          statusID: 0,
          smsID: 5040001,
          message: null,
        };
        return reply instanceof Error
          ? Promise.reject(reply)
          : Promise.resolve(reply);
      },
      log: (message, data) =>
        calls.logs.push(`${message} ${JSON.stringify(data ?? {})}`),
    },
  };
}

function signedRequest(event: unknown, secret = BASE64_SECRET): Request {
  const body = JSON.stringify(event);
  const id = "msg_test";
  const now = new Date();
  const signature = new Webhook(secret).sign(id, now, body);
  return new Request("https://example.test/functions/v1/auth-send-sms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body,
  });
}

function event(phone = "995599123456", userPhone: string | undefined = phone) {
  return {
    metadata: {
      uuid: "7d3f6a52-1111-4c3e-9a5f-0d2b8c7e6f10",
      ip_address: "203.0.113.5",
    },
    user: { id: "user-1", phone: userPhone },
    sms: { otp: CODE, phone },
  };
}

async function body(res: Response) {
  return JSON.parse(await res.text());
}

Deno.test("sends the code through uBill as an OTP and answers {}", async () => {
  const { deps: d, calls } = deps();
  const res = await handleSendSms(signedRequest(event()), d);
  assertEquals(res.status, 200);
  assertEquals(await body(res), {});
  assertEquals(calls.send.length, 1);
  const sent = calls.send[0];
  assertEquals(sent.number, "995599123456");
  assertEquals(sent.otp, true);
  assertEquals(sent.stopList, false);
  assertEquals(sent.brandId, 1);
  assertEquals(sent.timeoutMs, SEND_TIMEOUT_MS);
  assertEquals(
    sent.text,
    `MyBakuriani კოდი: ${CODE}. არავის გაუზიაროთ.\n@mybakuriani.ge #${CODE}`,
  );
  assertEquals(calls.reserve[0], {
    hookId: "7d3f6a52-1111-4c3e-9a5f-0d2b8c7e6f10",
    phone: "995599123456",
    ip: "203.0.113.5",
    userId: "user-1",
    kind: "sign_in",
  });
  assertEquals(calls.settle, [["row-1", true, "5040001"]]);
});

Deno.test(
  "a phone change texts the new number (sms.phone), not the old one",
  async () => {
    const { deps: d, calls } = deps();
    await handleSendSms(
      signedRequest(event("+995 555 00 00 01", "995599123456")),
      d,
    );
    assertEquals(calls.send[0].number, "995555000001");
    assertEquals(calls.reserve[0].kind, "phone_change");
  },
);

Deno.test("a missing secret fails closed", async () => {
  const { deps: d, calls } = deps({ env: { SEND_SMS_HOOK_SECRET: undefined } });
  const res = await handleSendSms(signedRequest(event()), d);
  assertEquals(await body(res), {
    error: { http_code: 503, message: AUTH_SMS_ERRORS.unavailable },
  });
  assertEquals(calls.send.length, 0);
});

Deno.test("a bad signature is refused before anything else", async () => {
  const { deps: d, calls } = deps();
  const res = await handleSendSms(
    signedRequest(event(), btoa("another-secret-another-secret!!")),
    d,
  );
  assertEquals(res.status, 401);
  assertEquals(calls.reserve.length + calls.send.length, 0);
});

Deno.test("an unsigned request is refused", async () => {
  const { deps: d, calls } = deps();
  const res = await handleSendSms(
    new Request("https://example.test/", {
      method: "POST",
      body: JSON.stringify(event()),
    }),
    d,
  );
  assertEquals(res.status, 401);
  assertEquals(calls.send.length, 0);
});

Deno.test("only Georgian mobiles get a code", async () => {
  for (const phone of [
    "14155550123",
    "995322123456",
    "99559912345",
    "447700900123",
  ]) {
    const { deps: d, calls } = deps();
    const res = await handleSendSms(signedRequest(event(phone)), d);
    assertEquals(await body(res), {
      error: { http_code: 400, message: AUTH_SMS_ERRORS.phoneNotSupported },
    });
    assertEquals(calls.reserve.length + calls.send.length, 0, phone);
  }
});

Deno.test(
  "delivery switches off -> sms_unavailable, nothing sent",
  async () => {
    for (const env of [
      { SMS_DELIVERY_ENABLED: "false" },
      { SMS_PROVIDER_API_KEY: undefined },
      { SMS_PROVIDER_BRAND_ID: undefined },
      { SMS_TEST_RECIPIENTS: "+995 555 00 00 99" },
    ]) {
      const { deps: d, calls } = deps({ env });
      const res = await handleSendSms(signedRequest(event()), d);
      assertEquals(
        (await body(res)).error.message,
        AUTH_SMS_ERRORS.unavailable,
      );
      assertEquals(calls.send.length, 0, JSON.stringify(env));
    }
  },
);

Deno.test("the allow-list lets a listed number through", async () => {
  const { deps: d, calls } = deps({
    env: { SMS_TEST_RECIPIENTS: "+995 599 12 34 56" },
  });
  await handleSendSms(signedRequest(event()), d);
  assertEquals(calls.send.length, 1);
});

Deno.test("cap refusals map to tokens and never send", async () => {
  const cases: [Reservation, string, number][] = [
    [{ ok: false, reason: "number_limit" }, AUTH_SMS_ERRORS.numberLimit, 429],
    [{ ok: false, reason: "ip_limit" }, AUTH_SMS_ERRORS.ipLimit, 429],
    [{ ok: false, reason: "site_limit" }, AUTH_SMS_ERRORS.unavailable, 503],
  ];
  for (const [reservation, message, http_code] of cases) {
    const { deps: d, calls } = deps({ reservation });
    const res = await handleSendSms(signedRequest(event()), d);
    assertEquals(res.status, 200);
    assertEquals(await body(res), { error: { http_code, message } });
    assertEquals(calls.send.length, 0);
  }
});

Deno.test("Auth retrying the same call does not send twice", async () => {
  const { deps: d, calls } = deps({
    reservation: { ok: true, id: "row-1", duplicate: true },
  });
  const res = await handleSendSms(signedRequest(event()), d);
  assertEquals(await body(res), {});
  assertEquals(calls.send.length, 0);
});

Deno.test(
  "provider refusal or outage -> sms_send_failed and the row is failed",
  async () => {
    for (const reply of [
      { http: 200, statusID: 10, smsID: null, message: "no balance" },
      { http: 500, statusID: null, smsID: null, message: null },
      new Error("timeout"),
    ]) {
      const { deps: d, calls } = deps({ reply });
      const res = await handleSendSms(signedRequest(event()), d);
      assertEquals(await body(res), {
        error: { http_code: 502, message: AUTH_SMS_ERRORS.sendFailed },
      });
      assertEquals(calls.settle, [["row-1", false, null]]);
    }
  },
);

Deno.test("the code never reaches the logs", async () => {
  const runs = [
    deps(),
    deps({ reservation: { ok: false, reason: "number_limit" } }),
    deps({ reply: new Error("timeout") }),
    deps({ reply: { http: 200, statusID: 10, smsID: null, message: "x" } }),
  ];
  for (const run of runs) {
    await handleSendSms(signedRequest(event()), run.deps);
    for (const line of run.calls.logs) {
      assertEquals(line.includes(CODE), false, line);
      assertEquals(line.includes("995599123456"), false, line);
    }
  }
});

Deno.test("no SITE_URL -> no origin-bound line", async () => {
  const { deps: d, calls } = deps({ env: { SITE_URL: undefined } });
  await handleSendSms(signedRequest(event()), d);
  assertEquals(
    calls.send[0].text,
    `MyBakuriani კოდი: ${CODE}. არავის გაუზიაროთ.`,
  );
});
