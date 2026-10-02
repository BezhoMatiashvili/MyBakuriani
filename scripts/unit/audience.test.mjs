import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAudience } from "../../src/lib/cabinets.ts";

const rows = (over = {}) => ({
  profiles: [],
  properties: [],
  services: [],
  cleaningTaskCleanerIds: [],
  approvedMemberUserIds: [],
  ...over,
});

test("a role-only user is matched by their profile role", () => {
  const out = resolveAudience(
    ["renter"],
    rows({
      profiles: [
        { id: "u1", role: "renter" },
        { id: "u2", role: "seller" },
      ],
    }),
  );
  assert.deepEqual([...out], ["u1"]);
});

test("a renter who owns a food service is matched by 'food'", () => {
  const out = resolveAudience(
    ["food"],
    rows({
      profiles: [{ id: "u1", role: "renter" }],
      services: [{ owner_id: "u1", category: "food" }],
    }),
  );
  assert.ok(out.has("u1"));
});

test("a seller via approved organization membership is matched by 'seller'", () => {
  const out = resolveAudience(
    ["seller"],
    rows({ approvedMemberUserIds: ["org-user"] }),
  );
  assert.ok(out.has("org-user"));
});

test("owned properties map to renter or seller by is_for_sale", () => {
  const props = [
    { owner_id: "a", is_for_sale: true },
    { owner_id: "b", is_for_sale: false },
    { owner_id: "c", is_for_sale: null },
  ];
  assert.deepEqual(
    [...resolveAudience(["seller"], rows({ properties: props }))],
    ["a"],
  );
  assert.deepEqual(
    [...resolveAudience(["renter"], rows({ properties: props }))].sort(),
    ["b", "c"],
  );
});

test("assigned cleaning tasks and cleaning services reach 'cleaner'; 'handyman' reaches services", () => {
  const out = resolveAudience(
    ["cleaner", "handyman"],
    rows({
      cleaningTaskCleanerIds: ["c1"],
      services: [
        { owner_id: "c2", category: "cleaning" },
        { owner_id: "h1", category: "plumbing" },
        { owner_id: "f1", category: "food" },
      ],
    }),
  );
  assert.deepEqual([...out].sort(), ["c1", "c2", "h1"]);
});

test("dedupes a user matched by role and by owned data", () => {
  const out = resolveAudience(
    ["food", "renter"],
    rows({
      profiles: [{ id: "u1", role: "food" }],
      services: [{ owner_id: "u1", category: "food" }],
      properties: [{ owner_id: "u1", is_for_sale: false }],
    }),
  );
  assert.equal(out.size, 1);
});

test("guest, admin and unknown roles stay role-only", () => {
  const owned = rows({
    profiles: [
      { id: "g", role: "guest" },
      { id: "a", role: "admin" },
    ],
    properties: [{ owner_id: "p", is_for_sale: false }],
    services: [{ owner_id: "s", category: "food" }],
  });
  assert.deepEqual([...resolveAudience(["guest"], owned)], ["g"]);
  assert.deepEqual([...resolveAudience(["admin"], owned)], ["a"]);
  assert.equal(resolveAudience(["nope"], owned).size, 0);
  assert.equal(resolveAudience([], owned).size, 0);
});
