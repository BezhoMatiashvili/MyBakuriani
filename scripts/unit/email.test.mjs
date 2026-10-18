import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  cleanSubject,
  escapeHtml,
  renderNotificationEmail,
} from "../../src/lib/email/render.ts";
import {
  isReservedAddress,
  recipientAllowed,
} from "../../src/lib/email/recipients.ts";
import { classifyResendResponse } from "../../src/lib/email/resend.ts";
import { classifyContactResponse } from "../../src/lib/email/resend-contacts.ts";
import { verifySvixSignature } from "../../src/lib/email/svix.ts";
import { EMAIL_NOTIFICATION_TYPES } from "../../src/lib/email/types.ts";
import {
  DASHBOARD_SCOPE_LABEL_KA,
  resolveNotificationPath,
} from "../../src/lib/notifications/scopes.ts";

test("user-written text is escaped in the HTML body and subject", () => {
  const out = renderNotificationEmail({
    subject: '<img src=x onerror="alert(1)">ბინა',
    body: "line1\n<script>x</script>",
    href: "https://mybakuriani.ge/dashboard?a=1&b=2",
    accountUrl: "https://mybakuriani.ge/dashboard/account",
  });
  assert.ok(!out.html.includes("<script>"));
  assert.ok(!out.html.includes("<img"));
  assert.ok(out.html.includes("&lt;script&gt;"));
  assert.ok(out.html.includes("line1<br>"));
  assert.ok(
    out.html.includes('href="https://mybakuriani.ge/dashboard?a=1&amp;b=2"'),
  );
  assert.ok(
    out.text.includes("ნახვა: https://mybakuriani.ge/dashboard?a=1&b=2"),
  );
});

test("no link means no button", () => {
  const out = renderNotificationEmail({
    subject: "გადახდა წარმატებულია",
    body: null,
    href: null,
    accountUrl: "https://x.ge/dashboard/account",
  });
  assert.ok(!out.html.includes(">ნახვა<"));
  assert.ok(!out.text.includes("ნახვა:"));
});

test("subjects cannot carry header line breaks and are capped", () => {
  assert.equal(cleanSubject("a\r\nBcc: evil@x.com"), "a Bcc: evil@x.com");
  assert.equal(cleanSubject("   "), "MyBakuriani");
  assert.equal(cleanSubject("x".repeat(500)).length, 200);
  assert.equal(escapeHtml(`"'&<>`), "&quot;&#39;&amp;&lt;&gt;");
});

test("Resend: only a clear refusal is final; ambiguity retries", () => {
  assert.deepEqual(classifyResendResponse(200, { id: "abc" }), {
    kind: "sent",
    providerMessageId: "abc",
  });
  assert.equal(classifyResendResponse(200, {}).kind, "retry");
  assert.equal(
    classifyResendResponse(429, { name: "daily_quota_exceeded" }).kind,
    "quota",
  );
  assert.equal(
    classifyResendResponse(429, { name: "monthly_quota_exceeded" }).kind,
    "quota",
  );
  assert.equal(
    classifyResendResponse(403, { name: "email_above_quota" }).kind,
    "quota",
  );
  assert.equal(
    classifyResendResponse(429, { name: "rate_limit_exceeded" }).kind,
    "retry",
  );
  assert.equal(
    classifyResendResponse(401, { name: "missing_api_key" }).kind,
    "misconfigured",
  );
  assert.equal(
    classifyResendResponse(403, { name: "invalid_permission" }).kind,
    "misconfigured",
  );
  assert.equal(
    classifyResendResponse(409, { name: "concurrent_idempotent_requests" })
      .kind,
    "retry",
  );
  assert.equal(
    classifyResendResponse(422, { name: "invalid_parameter" }).kind,
    "failed",
  );
  assert.equal(classifyResendResponse(500, null).kind, "retry");
  assert.equal(classifyResendResponse(503, null).kind, "retry");
});

test("Resend contacts: a missing contact on update means create; auth stops the run", () => {
  assert.equal(classifyContactResponse("update", 200, {}).kind, "done");
  assert.equal(classifyContactResponse("create", 201, {}).kind, "done");
  assert.equal(classifyContactResponse("update", 404, null).kind, "missing");
  assert.equal(classifyContactResponse("create", 404, null).kind, "retry");
  assert.equal(classifyContactResponse("update", 401, null).kind, "misconfigured");
  assert.equal(classifyContactResponse("update", 403, { name: "restricted_api_key" }).kind, "misconfigured");
  assert.equal(classifyContactResponse("create", 422, null).kind, "retry");
  assert.equal(classifyContactResponse("update", 500, null).kind, "retry");
});

test("Svix signatures verify, and tampering or replay fails", () => {
  const key = Buffer.from("test-signing-key-32-bytes-long!!");
  const secret = `whsec_${key.toString("base64")}`;
  const id = "msg_1";
  const timestamp = "1790000000";
  const body = '{"type":"email.bounced"}';
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const base = { secret, id, timestamp, body, nowSeconds: 1790000010 };

  assert.equal(verifySvixSignature({ ...base, signature: `v1,${sig}` }), true);
  assert.equal(
    verifySvixSignature({ ...base, signature: `v1,bad v1,${sig}` }),
    true,
  );
  assert.equal(
    verifySvixSignature({ ...base, signature: `v1,${sig}`, body: body + " " }),
    false,
  );
  assert.equal(verifySvixSignature({ ...base, signature: `v2,${sig}` }), false);
  assert.equal(
    verifySvixSignature({
      ...base,
      signature: `v1,${sig}`,
      nowSeconds: 1790001000,
    }),
    false,
  );
  assert.equal(verifySvixSignature({ ...base, signature: null }), false);
  assert.equal(
    verifySvixSignature({ ...base, signature: `v1,${sig}`, secret: "" }),
    false,
  );
});

test("the email allow-list has no duplicates and leaves marketing out", () => {
  assert.equal(
    new Set(EMAIL_NOTIFICATION_TYPES).size,
    EMAIL_NOTIFICATION_TYPES.length,
  );
  assert.ok(!EMAIL_NOTIFICATION_TYPES.includes("broadcast"));
  assert.ok(!EMAIL_NOTIFICATION_TYPES.includes("service_broadcast"));
});

test("the cabinet line is above the body, escaped, only for a scoped notice", () => {
  const base = {
    subject: "ახალი შეტყობინება",
    body: "ტექსტი",
    href: null,
    accountUrl: "https://x.ge/dashboard/account",
  };
  const scoped = renderNotificationEmail({
    ...base,
    cabinet: DASHBOARD_SCOPE_LABEL_KA.renter,
  });
  const line = `კაბინეტი: ${DASHBOARD_SCOPE_LABEL_KA.renter}`;
  assert.ok(scoped.text.includes(line));
  assert.ok(scoped.text.indexOf(line) < scoped.text.indexOf("ტექსტი"));
  assert.ok(scoped.html.indexOf(line) < scoped.html.indexOf("ტექსტი"));
  for (const none of [undefined, null, ""]) {
    const out = renderNotificationEmail({ ...base, cabinet: none });
    assert.ok(!out.text.includes("კაბინეტი"));
    assert.ok(!out.html.includes("კაბინეტი"));
  }
  const evil = renderNotificationEmail({ ...base, cabinet: "<b>x</b>" });
  assert.ok(!evil.html.includes("<b>x</b>"));
});

test("a bare /dashboard link goes to the notification's cabinet", () => {
  assert.equal(
    resolveNotificationPath("/dashboard", "seller"),
    "/dashboard/seller",
  );
  assert.equal(
    resolveNotificationPath("/dashboard/", "cleaner"),
    "/dashboard/cleaner",
  );
  // no scope (global notice, or a claim from the old function): unchanged
  assert.equal(resolveNotificationPath("/dashboard", null), "/dashboard");
  assert.equal(resolveNotificationPath("/dashboard", undefined), "/dashboard");
  // a specific link is never rewritten
  assert.equal(
    resolveNotificationPath("/dashboard/renter/calendar", "seller"),
    "/dashboard/renter/calendar",
  );
});

test("verification notices are emailed", () => {
  assert.ok(EMAIL_NOTIFICATION_TYPES.includes("verification"));
});

test("a broadcast carries the marketing footer and an unsubscribe link; notices do not", () => {
  const base = {
    subject: "სიახლე",
    body: "ტექსტი",
    href: null,
    accountUrl: "https://mybakuriani.ge/dashboard/account",
  };
  const notice = renderNotificationEmail(base);
  const broadcast = renderNotificationEmail({ ...base, marketing: true });
  assert.ok(notice.html.includes("სერვისული შეტყობინება"));
  assert.ok(!notice.html.includes("გამოწერის გაუქმება"));
  assert.ok(notice.text.endsWith("ჩემი ანგარიში: https://mybakuriani.ge/dashboard/account"));
  assert.ok(!broadcast.html.includes("სერვისული შეტყობინება"));
  assert.ok(broadcast.html.includes("„შეთავაზებები ელფოსტით“"));
  assert.ok(
    broadcast.html.includes(
      '<a href="https://mybakuriani.ge/dashboard/account" style="color:#6b7280">გამოწერის გაუქმება</a>',
    ),
  );
  assert.ok(
    broadcast.text.endsWith("გამოწერის გაუქმება: https://mybakuriani.ge/dashboard/account"),
  );
});

test("reserved test domains are never mailed; the allow-list is exact unless *", () => {
  assert.equal(isReservedAddress("admin@e2e.mybakuriani.test"), true);
  assert.equal(isReservedAddress("a@x.EXAMPLE"), true);
  assert.equal(isReservedAddress("a@b.invalid"), true);
  assert.equal(isReservedAddress("a@localhost"), true);
  assert.equal(isReservedAddress("info.mybakuriani@gmail.com"), false);
  assert.equal(isReservedAddress("a@testing.ge"), false);
  assert.equal(isReservedAddress("a@mybakuriani.ge"), false);
  const list = new Set(["beji@gmail.com"]);
  assert.equal(recipientAllowed(list, "beji@gmail.com"), true);
  assert.equal(recipientAllowed(list, "Beji@Gmail.com"), true);
  assert.equal(recipientAllowed(list, "other@gmail.com"), false);
  assert.equal(recipientAllowed(new Set(), "beji@gmail.com"), false);
  assert.equal(recipientAllowed("all", "anyone@gmail.com"), true);
});
