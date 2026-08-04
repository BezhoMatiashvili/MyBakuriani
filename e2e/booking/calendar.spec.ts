import { test, expect } from "../helpers/fixtures";
import { calendarBlocks, supabaseAdmin } from "../helpers/supabase";
import { createClient } from "@supabase/supabase-js";
import { configureIsolatedE2E } from "../helpers/env";
import { loadTestUsers } from "../helpers/fixtures";
import { futureISO } from "../helpers/seed";
import type { Database } from "../../src/lib/types/database";
import { createHash, randomBytes } from "node:crypto";

test.describe("Calendar and availability", () => {
  test.describe.configure({ mode: "serial" });
  test("seed data has calendar blocks for apartment", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("calendar_blocks")
      .select("*")
      .eq("property_id", testIds.apartment)
      .order("date");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const statuses = data!.map((c) => c.status);
    expect(statuses).toContain("available");
  });

  test("apartment has blocked dates from seed", async ({ testIds }) => {
    const { data, error } = await supabaseAdmin
      .from("calendar_blocks")
      .select("*")
      .eq("property_id", testIds.apartment);

    expect(error).toBeNull();
    const blocked = data!.filter((c) => c.status === "blocked");
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  test("property detail page renders", async ({ guestPage, testIds }) => {
    await guestPage.goto(`/apartments/${testIds.apartment}`);
    if (guestPage.url().includes("/auth/login")) {
      test
        .info()
        .annotations.push({ type: "skip", description: "Auth redirect" });
      return;
    }
    await expect(guestPage.locator("main")).toBeVisible();
  });

  test("calendar block status can be toggled via DB", async ({ testIds }) => {
    const block = await calendarBlocks.get(testIds.calendarBlock1);
    expect(block).not.toBeNull();
    expect(block!.status).toBe("available");

    const blocked = await calendarBlocks.update(testIds.calendarBlock1, {
      status: "blocked",
    });
    expect(blocked.status).toBe("blocked");

    const restored = await calendarBlocks.update(testIds.calendarBlock1, {
      status: "available",
    });
    expect(restored.status).toBe("available");
  });

  test("bulk availability RPC changes only safe rows", async ({ testIds }) => {
    const e2e = configureIsolatedE2E();
    const users = loadTestUsers();
    const renter = users.renter;
    const client = createClient<Database>(e2e.supabaseUrl, e2e.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await client.auth.setSession({
      access_token: renter.accessToken,
      refresh_token: renter.refreshToken,
    });

    const freshDate = futureISO(40);
    const bookedRow = await calendarBlocks.get(testIds.calendarBlock3);
    await supabaseAdmin
      .from("calendar_blocks")
      .delete()
      .eq("property_id", testIds.apartment)
      .eq("date", freshDate);

    const { data, error } = await client.rpc("apply_calendar_availability", {
      p_action: "blocked",
      p_dates: [freshDate, bookedRow!.date],
      p_property_id: testIds.apartment,
    });

    expect(error).toBeNull();
    expect(data?.[0].changed_dates).toEqual([freshDate]);
    expect(data?.[0].skipped_booked_dates).toEqual([bookedRow!.date]);

    const preserved = await calendarBlocks.get(testIds.calendarBlock3);
    expect(preserved?.status).toBe("booked");

    const cleanup = await client.rpc("apply_calendar_availability", {
      p_action: "available",
      p_dates: [freshDate],
      p_property_id: testIds.apartment,
    });
    expect(cleanup.error).toBeNull();

    await client.auth.setSession({
      access_token: users.guest.accessToken,
      refresh_token: users.guest.refreshToken,
    });
    const forbidden = await client.rpc("apply_calendar_availability", {
      p_action: "blocked",
      p_dates: [freshDate],
      p_property_id: testIds.apartment,
    });
    expect(forbidden.error).not.toBeNull();
    await client.auth.signOut();
  });

  test("manual booking cancellation is audited, restorable, and conflict-safe", async ({
    testIds,
  }) => {
    const e2e = configureIsolatedE2E();
    const users = loadTestUsers();
    const client = createClient<Database>(e2e.supabaseUrl, e2e.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await client.auth.setSession({
      access_token: users.renter.accessToken,
      refresh_token: users.renter.refreshToken,
    });

    const originalIn = futureISO(320);
    const originalOut = futureISO(321);
    const movedIn = futureISO(324);
    const movedOut = futureISO(325);
    const cleanupDates = [originalIn, originalOut, movedIn, movedOut];
    const bookingIds: string[] = [];
    const guestIds: string[] = [];

    await supabaseAdmin
      .from("calendar_blocks")
      .delete()
      .eq("property_id", testIds.apartment)
      .in("date", cleanupDates);

    try {
      const first = await client.rpc("create_manual_booking", {
        p_property_id: testIds.apartment,
        p_check_in: originalIn,
        p_check_out: originalOut,
        p_guest_name: "Cancellation history E2E A",
      });
      expect(first.error).toBeNull();
      bookingIds.push(first.data!.id);
      if (first.data!.renter_guest_id) guestIds.push(first.data!.renter_guest_id);

      const cancelled = await client.rpc("cancel_manual_booking", {
        p_id: first.data!.id,
      });
      expect(cancelled.error).toBeNull();
      expect(cancelled.data?.status).toBe("cancelled");
      expect(cancelled.data?.cancelled_by).toBe(users.renter.id);

      const cancelledAgain = await client.rpc("cancel_manual_booking", {
        p_id: first.data!.id,
      });
      expect(cancelledAgain.error).toBeNull();
      expect(cancelledAgain.data?.status).toBe("cancelled");

      const released = await supabaseAdmin
        .from("calendar_blocks")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", first.data!.id);
      expect(released.count).toBe(0);

      const cancellationAudit = await supabaseAdmin
        .from("audit_logs")
        .select("actor_id, old_values, new_values")
        .eq("table_name", "manual_bookings")
        .eq("record_id", first.data!.id)
        .eq("operation", "UPDATE")
        .contains("new_values", { status: "cancelled" })
        .maybeSingle();
      expect(cancellationAudit.error).toBeNull();
      expect(cancellationAudit.data?.actor_id).toBe(users.renter.id);
      expect(cancellationAudit.data?.old_values).toMatchObject({
        id: first.data!.id,
        guest_name: "Cancellation history E2E A",
        check_in: originalIn,
        check_out: originalOut,
        status: "manual",
      });
      expect(cancellationAudit.data?.new_values).toMatchObject({
        id: first.data!.id,
        guest_name: "Cancellation history E2E A",
        check_in: originalIn,
        check_out: originalOut,
        status: "cancelled",
        cancelled_by: users.renter.id,
      });

      const competing = await client.rpc("create_manual_booking", {
        p_property_id: testIds.apartment,
        p_check_in: originalIn,
        p_check_out: originalOut,
        p_guest_name: "Cancellation history E2E B",
      });
      expect(competing.error).toBeNull();
      bookingIds.push(competing.data!.id);
      if (competing.data!.renter_guest_id) guestIds.push(competing.data!.renter_guest_id);

      const conflictedRestore = await client.rpc("restore_manual_booking", {
        p_id: first.data!.id,
      });
      expect(conflictedRestore.error).not.toBeNull();

      const movedRestore = await client.rpc("update_manual_booking", {
        p_id: first.data!.id,
        p_check_in: movedIn,
        p_check_out: movedOut,
        p_guest_name: "Cancellation history E2E A",
      });
      expect(movedRestore.error).toBeNull();
      expect(movedRestore.data?.status).toBe("manual");

      const restoredAgain = await client.rpc("restore_manual_booking", {
        p_id: first.data!.id,
      });
      expect(restoredAgain.error).toBeNull();
      expect(restoredAgain.data?.status).toBe("manual");

      const restoredBlocks = await supabaseAdmin
        .from("calendar_blocks")
        .select("date")
        .eq("booking_id", first.data!.id)
        .order("date");
      expect(restoredBlocks.data?.map((row) => row.date)).toEqual([movedIn, movedOut]);
    } finally {
      if (bookingIds.length) {
        await supabaseAdmin.from("manual_bookings").delete().in("id", bookingIds);
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("table_name", "manual_bookings")
          .in("record_id", bookingIds);
      }
      if (guestIds.length) {
        await supabaseAdmin.from("renter_guests").delete().in("id", guestIds);
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("table_name", "renter_guests")
          .in("record_id", guestIds);
      }
      await supabaseAdmin
        .from("calendar_blocks")
        .delete()
        .eq("property_id", testIds.apartment)
        .in("date", cleanupDates);
      await client.auth.signOut();
    }
  });

  test("manual booking finances and verified SMS consent lifecycle", async ({
    testIds,
    request,
  }) => {
    const e2e = configureIsolatedE2E();
    const users = loadTestUsers();
    const client = createClient<Database>(e2e.supabaseUrl, e2e.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await client.auth.setSession({
      access_token: users.renter.accessToken,
      refresh_token: users.renter.refreshToken,
    });

    const checkIn = futureISO(340);
    const checkOut = futureISO(341);
    let bookingId: string | null = null;
    let guestId: string | null = null;
    await supabaseAdmin
      .from("calendar_blocks")
      .delete()
      .eq("property_id", testIds.apartment)
      .in("date", [checkIn, checkOut]);

    try {
      const missingDate = await client.rpc("create_manual_booking", {
        p_property_id: testIds.apartment,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent invalid date",
        p_amount: 1000,
        p_deposit_amount: 200,
      });
      expect(missingDate.error).not.toBeNull();

      const tooLarge = await client.rpc("create_manual_booking", {
        p_property_id: testIds.apartment,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent invalid amount",
        p_amount: 1000,
        p_deposit_amount: 1001,
        p_deposit_paid_on: checkIn,
      });
      expect(tooLarge.error).not.toBeNull();

      const created = await client.rpc("create_manual_booking", {
        p_property_id: testIds.apartment,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent E2E",
        p_guest_phone: "+995599123456",
        p_amount: 1000,
        p_marketing_consent: true,
      });
      expect(created.error).toBeNull();
      bookingId = created.data!.id;
      guestId = created.data!.renter_guest_id;
      expect(created.data!.deposit_amount).toBe(0);
      expect(created.data!.marketing_consent).toBe(false);

      const fullPayment = await client.rpc("update_manual_booking", {
        p_id: bookingId,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent E2E",
        p_guest_phone: "+995599123456",
        p_amount: 1000,
        p_deposit_amount: 1000,
        p_deposit_paid_on: checkIn,
        p_marketing_consent: true,
      });
      expect(fullPayment.error).toBeNull();
      expect(fullPayment.data?.deposit_amount).toBe(1000);
      expect(fullPayment.data?.marketing_consent).toBe(false);
      expect(Number(fullPayment.data?.amount) - Number(fullPayment.data?.deposit_amount)).toBe(0);

      const zeroDeposit = await client.rpc("update_manual_booking", {
        p_id: bookingId,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent E2E",
        p_guest_phone: "+995599123456",
        p_amount: 1000,
        p_deposit_amount: 0,
        p_deposit_paid_on: null,
      });
      expect(zeroDeposit.error).toBeNull();
      expect(zeroDeposit.data?.deposit_amount).toBe(0);

      const partialDeposit = await client.rpc("update_manual_booking", {
        p_id: bookingId,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent E2E",
        p_guest_phone: "+995599123456",
        p_amount: 1000,
        p_deposit_amount: 200,
        p_deposit_paid_on: checkIn,
      });
      expect(partialDeposit.error).toBeNull();
      expect(Number(partialDeposit.data?.amount) - Number(partialDeposit.data?.deposit_amount)).toBe(800);

      const directForgery = await client
        .from("manual_bookings")
        .update({ marketing_consent: true, marketing_consent_at: new Date().toISOString() })
        .eq("id", bookingId);
      expect(directForgery.error).not.toBeNull();

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const issued = await supabaseAdmin.rpc("issue_manual_booking_sms_consent", {
        p_consent_version: "manual-sms-v1",
        p_manual_booking_id: bookingId,
        p_owner_id: users.renter.id,
        p_phone_snapshot: "+995599123456",
        p_token_hash: tokenHash,
      });
      expect(issued.error).toBeNull();
      expect(issued.data?.token_hash).toBe(tokenHash);

      const details = await request.get(`/api/sms-consent/${token}`);
      expect(details.ok()).toBe(true);
      expect((await details.json()).consent.status).toBe("pending");

      const accepted = await request.post(`/api/sms-consent/${token}`, {
        data: { action: "accept" },
        headers: { Origin: e2e.baseUrl },
      });
      expect(accepted.ok()).toBe(true);
      const afterAccept = await supabaseAdmin
        .from("manual_bookings")
        .select("marketing_consent")
        .eq("id", bookingId)
        .single();
      expect(afterAccept.data?.marketing_consent).toBe(true);

      const replacementToken = randomBytes(32).toString("base64url");
      const replacementHash = createHash("sha256")
        .update(replacementToken)
        .digest("hex");
      const replacement = await supabaseAdmin.rpc(
        "issue_manual_booking_sms_consent",
        {
          p_consent_version: "manual-sms-v1",
          p_manual_booking_id: bookingId,
          p_owner_id: users.renter.id,
          p_phone_snapshot: "+995599123456",
          p_token_hash: replacementHash,
        },
      );
      expect(replacement.error).toBeNull();
      const afterReplacement = await supabaseAdmin
        .from("manual_bookings")
        .select("marketing_consent")
        .eq("id", bookingId)
        .single();
      expect(afterReplacement.data?.marketing_consent).toBe(false);
      expect((await request.get(`/api/sms-consent/${token}`)).status()).toBe(404);

      const replacementAccepted = await request.post(
        `/api/sms-consent/${replacementToken}`,
        {
          data: { action: "accept" },
          headers: { Origin: e2e.baseUrl },
        },
      );
      expect(replacementAccepted.ok()).toBe(true);

      const revoked = await request.post(`/api/sms-consent/${replacementToken}`, {
        data: { action: "revoke" },
        headers: { Origin: e2e.baseUrl },
      });
      expect(revoked.ok()).toBe(true);
      const afterRevoke = await supabaseAdmin
        .from("manual_bookings")
        .select("marketing_consent")
        .eq("id", bookingId)
        .single();
      expect(afterRevoke.data?.marketing_consent).toBe(false);
      expect(
        (await request.get(`/api/sms-consent/${replacementToken}`)).status(),
      ).toBe(404);

      const cleared = await client.rpc("update_manual_booking", {
        p_id: bookingId,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: "Finance consent E2E",
        p_guest_phone: "+995598123456",
        p_amount: 1000,
        p_deposit_amount: null,
        p_deposit_paid_on: null,
      });
      expect(cleared.error).toBeNull();
      expect(cleared.data?.deposit_amount).toBeNull();
      expect(cleared.data?.deposit_paid_on).toBeNull();
    } finally {
      if (bookingId) {
        await supabaseAdmin.from("manual_bookings").delete().eq("id", bookingId);
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("table_name", "manual_bookings")
          .eq("record_id", bookingId);
      }
      if (guestId) {
        await supabaseAdmin.from("renter_guests").delete().eq("id", guestId);
        await supabaseAdmin
          .from("audit_logs")
          .delete()
          .eq("table_name", "renter_guests")
          .eq("record_id", guestId);
      }
      await supabaseAdmin
        .from("calendar_blocks")
        .delete()
        .eq("property_id", testIds.apartment)
        .in("date", [checkIn, checkOut]);
      await client.auth.signOut();
    }
  });

  test("public property detail page loads", async ({ page, testIds }) => {
    await page.goto(`/apartments/${testIds.apartment}`);
    await expect(page.locator("main")).toBeVisible();
  });
});
