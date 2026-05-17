import { test, expect } from "../helpers/fixtures";
import { reviews, bookings, supabaseAdmin } from "../helpers/supabase";
import { futureISO } from "../helpers/seed";

// ---------------------------------------------------------------------------
// Guest leaves a review -> admin moderates it (approve / hide / remove).
// Exercises the admin /api/admin/reviews/moderate endpoint and verifies the
// resulting status + moderation_notes in DB.
// ---------------------------------------------------------------------------

const REV_ID = "aae2ff00-d100-4000-a000-000000000001";
const BOOKING_ID = "aae2ff00-d100-4000-a000-000000000002";

test.describe.configure({ mode: "serial" });

test.describe("Review moderation flow", () => {
  test.afterAll(async () => {
    await reviews.delete(REV_ID).catch(() => {});
    await bookings.delete(BOOKING_ID).catch(() => {});
  });

  test("seed: completed booking + guest review", async ({ testIds }) => {
    await bookings.create({
      id: BOOKING_ID,
      property_id: testIds.apartment,
      guest_id: testIds.guest,
      owner_id: testIds.renter,
      check_in: futureISO(-10),
      check_out: futureISO(-7),
      guests_count: 2,
      total_price: 450,
      currency: "GEL",
      status: "completed",
      guest_message: "review moderation seed",
    });

    const r = await reviews.create({
      id: REV_ID,
      property_id: testIds.apartment,
      booking_id: BOOKING_ID,
      guest_id: testIds.guest,
      rating: 3,
      comment: "ცუდი მომსახურება — შესაცვლელია",
    });
    expect(r.rating).toBe(3);
  });

  test("admin approves the review via API", async ({ adminPage }) => {
    const res = await adminPage.request.post("/api/admin/reviews/moderate", {
      data: { id: REV_ID, action: "approve", notes: "ok" },
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("approved");

    const { data } = await supabaseAdmin
      .from("reviews")
      .select("status, moderation_notes, moderated_by")
      .eq("id", REV_ID)
      .single();
    expect(data?.status).toBe("approved");
    expect(data?.moderation_notes).toBe("ok");
  });

  test("admin hides the review", async ({ adminPage }) => {
    const res = await adminPage.request.post("/api/admin/reviews/moderate", {
      data: { id: REV_ID, action: "hide", notes: "სპამი" },
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(200);

    const { data } = await supabaseAdmin
      .from("reviews")
      .select("status, moderation_notes")
      .eq("id", REV_ID)
      .single();
    expect(data?.status).toBe("hidden");
    expect(data?.moderation_notes).toBe("სპამი");
  });

  test("admin removes the review", async ({ adminPage }) => {
    const res = await adminPage.request.post("/api/admin/reviews/moderate", {
      data: { id: REV_ID, action: "remove" },
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(200);

    const { data } = await supabaseAdmin
      .from("reviews")
      .select("status")
      .eq("id", REV_ID)
      .single();
    expect(data?.status).toBe("removed");
  });

  test("invalid action returns 400", async ({ adminPage }) => {
    const res = await adminPage.request.post("/api/admin/reviews/moderate", {
      data: { id: REV_ID, action: "delete_database" },
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("non-admin (renter) is rejected", async ({ renterPage }) => {
    const res = await renterPage.request.post("/api/admin/reviews/moderate", {
      data: { id: REV_ID, action: "approve" },
      headers: { "content-type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
