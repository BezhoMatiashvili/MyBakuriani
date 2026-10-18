import { test } from "node:test";
import assert from "node:assert/strict";
import { claimRoom, criticalReserve } from "../../src/lib/email/budget.ts";

// BATCH in src/app/api/email/dispatch/route.ts
const BATCH = 25;

test("a quarter of the daily cap is kept for class-1 mail", () => {
  assert.equal(criticalReserve(80), 20);
  assert.equal(criticalReserve(100), 25);
  assert.equal(criticalReserve(3000), 750);
  assert.equal(criticalReserve(0), 0);
});

test("fresh day: a full batch of any class", () => {
  assert.deepEqual(claimRoom(80, 0, BATCH), { total: 25, shared: 25 });
});

test("classes 2-3 stop at cap minus reserve; class 1 keeps the rest", () => {
  assert.deepEqual(claimRoom(80, 50, BATCH), { total: 25, shared: 10 });
  assert.deepEqual(claimRoom(80, 60, BATCH), { total: 20, shared: 0 });
  assert.deepEqual(claimRoom(80, 79, BATCH), { total: 1, shared: 0 });
});

test("cap reached, or lowered below today's count: nothing is claimed", () => {
  assert.deepEqual(claimRoom(80, 80, BATCH), { total: 0, shared: 0 });
  assert.deepEqual(claimRoom(80, 95, BATCH), { total: 0, shared: 0 });
  assert.deepEqual(claimRoom(0, 0, BATCH), { total: 0, shared: 0 });
});

test("invariants for every cap and send count", () => {
  for (let cap = 0; cap <= 200; cap++) {
    for (let sent = 0; sent <= cap + 5; sent++) {
      const { total, shared } = claimRoom(cap, sent, BATCH);
      assert.ok(shared >= 0 && shared <= total && total <= BATCH);
      assert.equal(total > 0, sent < cap);
      assert.ok(sent + total <= Math.max(cap, sent));
      if (shared > 0) assert.ok(sent + shared <= cap - criticalReserve(cap));
    }
  }
});

// A day of 5-minute runs against a model of email_claim_batch: class 1 first,
// then at most `shared` rows of classes 2-3, oldest first within a class.
function simulateDay(cap, arrivals) {
  const queue = { critical: 0, other: 0 };
  const sent = { critical: 0, other: 0 };
  for (let run = 0; run < 288; run++) {
    queue.critical += arrivals.critical(run);
    queue.other += arrivals.other(run);
    const room = claimRoom(cap, sent.critical + sent.other, BATCH);
    const critical = Math.min(queue.critical, room.total);
    const other = Math.min(queue.other, room.shared, room.total - critical);
    queue.critical -= critical;
    queue.other -= other;
    sent.critical += critical;
    sent.other += other;
  }
  return sent;
}

test("a flood of user-triggered mail never uses the class-1 reserve", () => {
  const sent = simulateDay(80, {
    other: (run) => (run === 0 ? 1000 : 0),
    critical: (run) => (run === 200 ? 15 : 0),
  });
  assert.equal(sent.other, 60);
  assert.equal(sent.critical, 15);
});

test("class-1 mail goes out first and may use the whole cap", () => {
  // Runs of 25 + 25 + (20 class 1 + 5 others): after 75 sends the other
  // classes are past cap minus reserve (60) and wait for the next day.
  const sent = simulateDay(80, {
    other: (run) => (run === 0 ? 50 : 0),
    critical: (run) => (run === 0 ? 70 : 0),
  });
  assert.equal(sent.critical, 70);
  assert.equal(sent.other, 5);
});

test("a quiet day sends everything", () => {
  const sent = simulateDay(80, {
    other: (run) => (run % 12 === 0 ? 2 : 0),
    critical: (run) => (run % 24 === 0 ? 1 : 0),
  });
  assert.equal(sent.other, 48);
  assert.equal(sent.critical, 12);
});
