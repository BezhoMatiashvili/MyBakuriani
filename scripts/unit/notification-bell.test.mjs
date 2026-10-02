import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_SCOPES,
  DASHBOARD_SCOPE_LABEL_KA,
  notificationScopeLabelKey,
  unreadFirst,
  resolveNotificationPath,
} from "../../src/lib/notifications/scopes.ts";
import ka from "../../messages/ka.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import ru from "../../messages/ru.json" with { type: "json" };

test("every cabinet scope maps to itself; NULL and unknown scopes read general", () => {
  for (const scope of DASHBOARD_SCOPES) {
    assert.equal(notificationScopeLabelKey(scope), scope);
  }
  assert.equal(notificationScopeLabelKey(null), "general");
  assert.equal(notificationScopeLabelKey(undefined), "general");
  assert.equal(notificationScopeLabelKey(""), "general");
  assert.equal(notificationScopeLabelKey("handyman"), "general");
});

test("Navbar.scopeLabels has every cabinet plus general in all three catalogs", () => {
  const expected = [...DASHBOARD_SCOPES, "general"].sort();
  for (const catalog of [ka, en, ru]) {
    const labels = catalog.Navbar.scopeLabels;
    assert.deepEqual(Object.keys(labels).sort(), expected);
    for (const value of Object.values(labels)) {
      assert.ok(typeof value === "string" && value.length > 0);
    }
  }
});

test("the Georgian catalog labels equal DASHBOARD_SCOPE_LABEL_KA (email/SMS twin)", () => {
  for (const scope of DASHBOARD_SCOPES) {
    assert.equal(ka.Navbar.scopeLabels[scope], DASHBOARD_SCOPE_LABEL_KA[scope]);
  }
  assert.equal(ka.Navbar.scopeLabels.general, "ზოგადი");
});

test("unreadFirst keeps newest-first order inside each group and does not mutate", () => {
  const rows = [
    { id: "a", is_read: true },
    { id: "b", is_read: false },
    { id: "c", is_read: true },
    { id: "d", is_read: false },
  ];
  assert.deepEqual(
    unreadFirst(rows).map((r) => r.id),
    ["b", "d", "a", "c"],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c", "d"],
  );
});

test("a bare /dashboard link resolves to the notification's own cabinet", () => {
  assert.equal(resolveNotificationPath("/dashboard", "food"), "/dashboard/food");
  assert.equal(resolveNotificationPath("/dashboard", null), "/dashboard");
  assert.equal(
    resolveNotificationPath("/dashboard/seller/leads", "renter"),
    "/dashboard/seller/leads",
  );
  assert.equal(resolveNotificationPath(null, "food"), null);
});
