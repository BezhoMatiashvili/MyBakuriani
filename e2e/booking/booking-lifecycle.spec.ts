import { test, expect } from "../helpers/fixtures";
import { bookings, calendarBlocks, supabaseAdmin } from "../helpers/supabase";

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const BOOKING_IDS = {
  lifecycle: "aae2ff00-c300-4000-a000-000000000001",
  conflict: "aae2ff00-c300-4000-a000-000000000002",
};

const CAL_IDS = {
  day1: "aae2ff00-c300-4000-a000-000000000010",
  day2: "aae2ff00-c300-4000-a000-000000000011",
  day3: "aae2ff00-c300-4000-a000-000000000012",
};

test.describe("Booking lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    for (const id of Object.values(BOOKING_IDS)) {
      await bookings.delete(id).catch(() => {});
    }
    for (const id of Object.values(CAL_IDS)) {
      await calendarBlocks.delete(id).catch(() => {});
    }
  });

  test("create available calendar dates via DB", async ({ testIds }) => {
    const dates = [
      {
        id: CAL_IDS.day1,
        property_id: testIds.villa,
        date: futureDate(20),
        status: "available" as const,
      },
      {
        id: CAL_IDS.day2,
        property_id: testIds.villa,
        date: futureDate(21),
        status: "available" as const,
      },
      {
        id: CAL_IDS.day3,
        property_id: testIds.villa,
        date: futureDate(22),
        status: "available" as const,
      },
    ];
    const created = await calendarBlocks.createMany(dates);
    expect(created.length).toBe(3);
    expect(created.every((c) => c.status === "available")).toBe(true);
  });

  test("create a pending booking via DB", async ({ testIds }) => {
    const booking = await bookings.create({
      id: BOOKING_IDS.lifecycle,
      property_id: testIds.villa,
      guest_id: testIds.guest,
      owner_id: testIds.renter,
      check_in: futureDate(20),
      check_out: futureDate(23),
      guests_count: 4,
      status: "pending",
      total_price: 1350,
      currency: "₾",
      guest_message: "E2E lifecycle test booking",
    });
    expect(booking.status).toBe("pending");
    expect(booking.total_price).toBe(1350);
  });

  test("update calendar blocks to booked", async () => {
    for (const id of Object.values(CAL_IDS)) {
      const updated = await calendarBlocks.update(id, { status: "booked" });
      expect(updated.status).toBe("booked");
    }
  });

  test("confirm booking via DB", async () => {
    const confirmed = await bookings.update(BOOKING_IDS.lifecycle, {
      status: "confirmed",
      owner_response: "მოგესალმებით! დადასტურებულია.",
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.owner_response).toBeTruthy();
  });

  test("complete booking via DB", async () => {
    const completed = await bookings.update(BOOKING_IDS.lifecycle, {
      status: "completed",
    });
    expect(completed.status).toBe("completed");
  });

  test("cancel booking and revert calendar", async ({ testIds }) => {
    // Create another booking to cancel
    const booking = await bookings.create({
      id: BOOKING_IDS.conflict,
      property_id: testIds.villa,
      guest_id: testIds.guest,
      owner_id: testIds.renter,
      check_in: futureDate(20),
      check_out: futureDate(23),
      guests_count: 2,
      status: "pending",
      total_price: 900,
      currency: "₾",
    });
    expect(booking.status).toBe("pending");

    // Cancel it
    const cancelled = await bookings.update(BOOKING_IDS.conflict, {
      status: "cancelled",
    });
    expect(cancelled.status).toBe("cancelled");

    // Revert calendar blocks to available
    for (const id of Object.values(CAL_IDS)) {
      const reverted = await calendarBlocks.update(id, { status: "available" });
      expect(reverted.status).toBe("available");
    }
  });

  test("booking status transitions are correct", async () => {
    const lifecycle = await bookings.get(BOOKING_IDS.lifecycle);
    expect(lifecycle!.status).toBe("completed");

    const conflict = await bookings.get(BOOKING_IDS.conflict);
    expect(conflict!.status).toBe("cancelled");
  });
});
