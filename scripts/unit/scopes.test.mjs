import { test } from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_SCOPES, dashboardScopeFromRoute, dashboardScopeForPath, serviceCategoryToDashboardScope } from "../../src/lib/notifications/scopes.ts";

test("DASHBOARD_SCOPES has the 10 cabinet keys and no duplicates", () => {
  assert.equal(DASHBOARD_SCOPES.length, 10);
  assert.equal(new Set(DASHBOARD_SCOPES).size, 10);
});

test("route aliases resolve to their owning cabinet", () => {
  assert.equal(dashboardScopeFromRoute("sms"), "renter");
  assert.equal(dashboardScopeFromRoute("service"), "services");
  assert.equal(dashboardScopeFromRoute("handyman"), "services");
  assert.equal(dashboardScopeFromRoute("admin"), "admin");
  assert.equal(dashboardScopeFromRoute("nope"), null);
  assert.equal(dashboardScopeFromRoute(null), null);
});

test("dashboardScopeForPath reads the segment after /dashboard regardless of locale", () => {
  assert.equal(dashboardScopeForPath("/en/dashboard/sms/history"), "renter");
  assert.equal(dashboardScopeForPath("/dashboard/cleaner"), "cleaner");
  assert.equal(dashboardScopeForPath("/apartments/123"), null);
});

test("service categories map onto cabinets, defaulting to services", () => {
  assert.equal(serviceCategoryToDashboardScope("cleaning"), "cleaner");
  assert.equal(serviceCategoryToDashboardScope("food"), "food");
  assert.equal(serviceCategoryToDashboardScope("transport"), "transport");
  assert.equal(serviceCategoryToDashboardScope("handyman"), "services");
  assert.equal(serviceCategoryToDashboardScope(undefined), "services");
});

test("a bare /dashboard link resolves to the cabinet that owns the notification", async () => {
  const { resolveNotificationPath, DASHBOARD_SCOPE_LABEL_KA } = await import("../../src/lib/notifications/scopes.ts");
  assert.equal(resolveNotificationPath("/dashboard", "food"), "/dashboard/food");
  assert.equal(resolveNotificationPath("/dashboard/", "seller"), "/dashboard/seller");
  assert.equal(resolveNotificationPath("/dashboard", null), "/dashboard");
  assert.equal(resolveNotificationPath("/dashboard", "bogus"), "/dashboard");
  assert.equal(resolveNotificationPath("/dashboard/renter/smart-match", "guest"), "/dashboard/renter/smart-match");
  assert.equal(resolveNotificationPath(null, "food"), null);
  assert.equal(Object.keys(DASHBOARD_SCOPE_LABEL_KA).length, 10);
});
