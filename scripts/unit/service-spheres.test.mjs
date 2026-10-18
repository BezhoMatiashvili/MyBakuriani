import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SERVICE_SPHERES,
  categoryForSphere,
  createServiceHref,
  parseCategoryHint,
  spheresFor,
} from "../../src/lib/service-spheres.ts";
import { CATEGORY_TO_CREATE_HREF } from "../../src/lib/dashboard/serviceSegments.ts";
import { serviceCategoryToCabinetKey } from "../../src/lib/cabinets.ts";

const read = (rel) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// Enum values straight from the generated types (the `Constants` arrays).
function enumValues(name) {
  const m = read("src/lib/types/database.generated.ts").match(
    new RegExp(`${name}: \\[([^\\]]*)\\]`),
  );
  assert.ok(m, `${name} enum not found in database.generated.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

test("every sphere files under a real services.category", () => {
  const categories = enumValues("service_category");
  for (const s of SERVICE_SPHERES) {
    assert.ok(categories.includes(s.category), `${s.value} -> ${s.category}`);
  }
});

test("only the Cleaning sphere files under cleaning", () => {
  const cleaning = SERVICE_SPHERES.filter((s) => s.category === "cleaning");
  assert.deepEqual(
    cleaning.map((s) => s.value),
    ["cleaning"],
  );
  for (const s of SERVICE_SPHERES.filter((x) => x.value !== "cleaning")) {
    assert.equal(categoryForSphere(s.value), "handyman", s.value);
  }
});

test("the sphere's category decides the cabinet", () => {
  for (const s of SERVICE_SPHERES) {
    assert.equal(
      serviceCategoryToCabinetKey(categoryForSphere(s.value)),
      s.value === "cleaning" ? "cleaner" : "services",
      s.value,
    );
  }
});

test("spheresFor narrows by category and offers everything while it is open", () => {
  assert.equal(spheresFor(null).length, SERVICE_SPHERES.length);
  assert.deepEqual(
    spheresFor("cleaning").map((s) => s.value),
    ["cleaning"],
  );
  assert.deepEqual(
    spheresFor("handyman").map((s) => s.value),
    ["handymen", "staff", "tourism", "sales", "other"],
  );
});

test("parseCategoryHint accepts only the two form categories", () => {
  assert.equal(parseCategoryHint("cleaning"), "cleaning");
  assert.equal(parseCategoryHint("handyman"), "handyman");
  for (const raw of ["food", "Cleaning", "", " cleaning", null, undefined]) {
    assert.equal(parseCategoryHint(raw), null, String(raw));
  }
});

test("createServiceHref round-trips through parseCategoryHint", () => {
  assert.equal(createServiceHref(), "/create/service");
  for (const category of ["cleaning", "handyman"]) {
    const url = new URL(createServiceHref(category), "http://localhost");
    assert.equal(url.pathname, "/create/service");
    assert.equal(parseCategoryHint(url.searchParams.get("category")), category);
  }
});

test("the Services cabinet's Add link fixes the handyman category", () => {
  assert.equal(CATEGORY_TO_CREATE_HREF.handyman, createServiceHref("handyman"));
  assert.equal(CATEGORY_TO_CREATE_HREF.transport, "/create/transport");
  assert.equal(CATEGORY_TO_CREATE_HREF.employment, "/create/employment");
  assert.equal(CATEGORY_TO_CREATE_HREF.entertainment, "/create/entertainment");
});

test("dbLabel <-> value matches the display lookup in listing-options.ts", () => {
  const block = read("src/lib/constants/listing-options.ts").match(
    /serviceSpheres: \{([^}]*)\}/,
  );
  assert.ok(block, "serviceSpheres block not found");
  const lookup = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(?:"([^"]+)"|([^\s:]+)):\s*"([^"]+)",?\s*$/);
    if (m) lookup[m[1] ?? m[2]] = m[3];
  }
  assert.deepEqual(
    lookup,
    Object.fromEntries(SERVICE_SPHERES.map((s) => [s.dbLabel, s.value])),
  );
});

test("every sphere and both new form messages are worded in ka/en/ru", () => {
  for (const locale of ["ka", "en", "ru"]) {
    const messages = JSON.parse(read(`messages/${locale}.json`));
    for (const s of SERVICE_SPHERES) {
      assert.ok(
        messages.ListingOptions.serviceSpheres[s.value],
        `${locale} ListingOptions.serviceSpheres.${s.value}`,
      );
    }
    for (const key of ["chooseSphere", "sphereLockedHint"]) {
      assert.ok(messages.CreateService[key], `${locale} CreateService.${key}`);
    }
  }
});

test("the e2e seed files cleaning services under the Cleaning label", () => {
  const cleaning = SERVICE_SPHERES.find((s) => s.value === "cleaning");
  assert.ok(read("e2e/helpers/seed.ts").includes(cleaning.dbLabel));
});

test("the create form never starts with a sphere chosen for the user", () => {
  const page = read("src/app/[locale]/create/service/page.tsx");
  assert.ok(
    !/useState<SphereValue(?: \| "")?>\(\s*"cleaning"\s*\)/.test(page),
    "sphere must not default to cleaning",
  );
  assert.ok(page.includes('t("chooseSphere")'), "empty sphere must be refused");
  assert.ok(
    page.includes("categoryForSphere(sphere)"),
    "category must come from the sphere table",
  );
});
