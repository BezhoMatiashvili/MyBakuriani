import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSalary, salaryModelOf } from "../../src/lib/employment/salary.ts";

test("salaryModelOf maps the stored Georgian labels and the keys themselves", () => {
  assert.equal(salaryModelOf("ფიქსირებული"), "fixed");
  assert.equal(salaryModelOf("ფიქსირებული + ბონუსი/Tips"), "fixed_bonus");
  assert.equal(salaryModelOf("გამომუშავებით (%)"), "commission");
  assert.equal(salaryModelOf(" შეთანხმებით "), "negotiable");
  assert.equal(salaryModelOf("fixed_bonus"), "fixed_bonus");
  assert.equal(salaryModelOf("commission"), "commission");
  assert.equal(salaryModelOf("something else"), null);
  assert.equal(salaryModelOf(""), null);
  assert.equal(salaryModelOf(null), null);
  assert.equal(salaryModelOf(undefined), null);
});

test("commission and negotiable win over stale numbers still on the row", () => {
  // Staging row 9304ac35: commission with min/max left over from an edit.
  assert.deepEqual(
    describeSalary({
      salary_type: "გამომუშავებით (%)",
      salary_min: 800,
      salary_max: 1200,
      salary_range: "800-1200 ₾",
    }),
    { kind: "model", model: "commission" },
  );
  assert.deepEqual(
    describeSalary({ salary_type: "შეთანხმებით", salary_daily: 60 }),
    { kind: "model", model: "negotiable" },
  );
});

test("amounts: range, from (min only), up to (max only), daily", () => {
  assert.deepEqual(
    describeSalary({ salary_type: "ფიქსირებული", salary_min: 1000, salary_max: 1500 }),
    { kind: "range", min: 1000, max: 1500 },
  );
  assert.deepEqual(
    describeSalary({ salary_type: "ფიქსირებული", salary_min: 1000, salary_max: 1000 }),
    { kind: "range", min: 1000, max: 1000 },
  );
  assert.deepEqual(
    describeSalary({ salary_type: "ფიქსირებული", salary_min: 900, salary_max: null }),
    { kind: "from", min: 900 },
  );
  assert.deepEqual(describeSalary({ salary_max: 2000 }), { kind: "upTo", max: 2000 });
  assert.deepEqual(
    describeSalary({ salary_type: "ფიქსირებული + ბონუსი/Tips", salary_daily: 70 }),
    { kind: "daily", amount: 70 },
  );
});

test("numeric strings are accepted, zero and junk are not amounts", () => {
  assert.deepEqual(describeSalary({ salary_min: "1200", salary_max: "1800" }), {
    kind: "range",
    min: 1200,
    max: 1800,
  });
  assert.deepEqual(describeSalary({ salary_type: "ფიქსირებული", salary_min: 0, salary_daily: 0 }), {
    kind: "model",
    model: "fixed",
  });
  assert.deepEqual(describeSalary({ salary_min: "abc", price: -5 }), {
    kind: "model",
    model: "negotiable",
  });
});

test("legacy text range and price fall back after the structured fields", () => {
  assert.deepEqual(describeSalary({ salary_range: "800-1200 ₾" }), {
    kind: "range",
    min: 800,
    max: 1200,
  });
  // Comma thousands (admin free text) must not become 1.2–1.5.
  assert.deepEqual(describeSalary({ salary_range: "1,200-1,500 ₾" }), {
    kind: "model",
    model: "negotiable",
  });
  assert.deepEqual(describeSalary({ salary_range: "ხელშეკრულებით" }), {
    kind: "model",
    model: "negotiable",
  });
  assert.deepEqual(describeSalary({ price: 1500 }), { kind: "range", min: 1500, max: 1500 });
  assert.deepEqual(describeSalary({ salary_min: 900, price: 1500 }), { kind: "from", min: 900 });
});

test("no amount: the chosen salary type, else negotiable", () => {
  assert.deepEqual(describeSalary({ salary_type: "ფიქსირებული" }), {
    kind: "model",
    model: "fixed",
  });
  assert.deepEqual(describeSalary({ salary_type: "ფიქსირებული + ბონუსი/Tips" }), {
    kind: "model",
    model: "fixed_bonus",
  });
  assert.deepEqual(describeSalary({}), { kind: "model", model: "negotiable" });
  assert.deepEqual(describeSalary({ salary_type: "უცნობი" }), { kind: "model", model: "negotiable" });
});
