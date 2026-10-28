import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  CABINET_KEYS,
  roleHomePath,
  roleToCabinetKey,
  serviceCategoryToCabinetKey,
} from "../../src/lib/cabinets.ts";
import { safeInternalPath, stripLocalePrefix } from "../../src/lib/security.ts";

const root = new URL("../../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const dashboardDir = (segment) =>
  existsSync(new URL(`src/app/[locale]/dashboard/${segment}`, root));

function enumValues(name) {
  const m = read("src/lib/types/database.generated.ts").match(
    new RegExp(`${name}: \\[([^\\]]*)\\]`),
  );
  assert.ok(m, `${name} enum not found in database.generated.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

test("every user_role lands on a dashboard that exists", () => {
  for (const role of enumValues("user_role")) {
    const path = roleHomePath(role);
    const [, dashboard, segment] = path.split("/");
    assert.equal(dashboard, "dashboard", role);
    assert.ok(dashboardDir(segment), `${role} -> ${path} has no route`);
  }
});

test("a role's home path is its home cabinet (admin has its own)", () => {
  for (const role of enumValues("user_role")) {
    if (role === "admin") {
      assert.equal(roleHomePath(role), "/dashboard/admin");
      continue;
    }
    assert.equal(
      roleHomePath(role),
      `/dashboard/${roleToCabinetKey(role)}`,
      role,
    );
  }
});

test("an unknown or missing role falls back to the guest cabinet", () => {
  assert.equal(roleHomePath("nope"), "/dashboard/guest");
  assert.equal(roleHomePath(""), "/dashboard/guest");
});

test("every cabinet has a dashboard route", () => {
  for (const key of CABINET_KEYS) {
    assert.ok(dashboardDir(key), `cabinet ${key} has no route`);
  }
});

test("every service category resolves to an existing cabinet", () => {
  for (const category of enumValues("service_category")) {
    const cabinet = serviceCategoryToCabinetKey(category);
    assert.ok(CABINET_KEYS.includes(cabinet), `${category} -> ${cabinet}`);
    assert.ok(dashboardDir(cabinet), `${category} -> /dashboard/${cabinet}`);
  }
  assert.equal(serviceCategoryToCabinetKey("cleaning"), "cleaner");
  assert.equal(serviceCategoryToCabinetKey("handyman"), "services");
});

test("the auth pages share one role->dashboard map (cabinets.ts)", () => {
  for (const file of [
    "src/app/[locale]/auth/register/page.tsx",
    "src/app/[locale]/auth/login/page.tsx",
    "src/app/[locale]/auth/reset-password/page.tsx",
    "src/app/[locale]/auth/post-auth-redirect.ts",
  ]) {
    const src = read(file);
    assert.ok(!src.includes("ROLE_DASHBOARD"), `${file} has its own map`);
    assert.ok(src.includes("roleHomePath"), `${file} must use roleHomePath`);
  }
});

test("the wizard never tries to change an existing profile's role", () => {
  // profiles_lock_role raises 42501 for any role change from a user session,
  // so the 23505 branch reads the saved role back instead of updating it.
  const src = read("src/app/[locale]/auth/register/page.tsx");
  assert.ok(!/\.update\(\s*\{\s*role/.test(src), "role UPDATE from the wizard");
  assert.ok(
    src.includes("openExistingCabinet"),
    "mismatch must open the cabinet",
  );
});

test("login strips the middleware's locale prefix from next and re-validates it", () => {
  // next-intl's router adds the locale back; pushing /en/... as it is gave
  // /en/en/... (404), and a stripped /en//evil.example must not stay "//".
  const src = read("src/app/[locale]/auth/login/page.tsx");
  assert.ok(src.includes("stripLocalePrefix(next, routing.locales)"));
  assert.ok(/safeNextPath\(\s*stripLocalePrefix\(/.test(src));
});

test("an account with no profile is sent to the wizard, not the login page", () => {
  assert.ok(
    read("src/app/[locale]/dashboard/page.tsx").includes('"/auth/register"'),
  );
  assert.ok(
    read("src/app/[locale]/auth/reset-password/page.tsx").includes(
      '"/auth/register"',
    ),
  );
});

test("/create sends an account with no profile to the wizard, which returns only once the profile exists", () => {
  // Without a profile no free period (C53) or membership can reach the account,
  // so /create/rental would ask for a membership it can never see.
  const layout = read("src/app/[locale]/create/layout.tsx");
  assert.ok(layout.includes('"/auth/register?next=/create"'));
  assert.ok(layout.includes("getCurrentProfile().catch(() => null)"));

  // `next` is validated like login's (C8) and used only after persistProfile():
  // an existing profile still opens its cabinet, so the two cannot loop.
  const wizard = read("src/app/[locale]/auth/register/page.tsx");
  assert.ok(
    /safeInternalPath\(\s*stripLocalePrefix\(searchParams\.get\("next"\)/.test(
      wizard,
    ),
  );
  const check = wizard.slice(
    wizard.indexOf("async function checkExistingProfile"),
    wizard.indexOf("checkExistingProfile();"),
  );
  assert.ok(check.includes("roleHomePath(profile.role)"));
  assert.ok(!check.includes("nextPath"));
  assert.equal(wizard.match(/\?\? nextPath \?\? "\/"/g)?.length, 2);

  const next = (raw) =>
    safeInternalPath(stripLocalePrefix(raw, ["ka", "en", "ru"]));
  assert.equal(next("/create"), "/create");
  assert.equal(next("/en/create"), "/create");
  assert.equal(next("https://evil.example"), null);
  assert.equal(next("//evil.example"), null);
  assert.equal(next("/en//evil.example"), "/evil.example");
  assert.equal(next(""), null);
});
