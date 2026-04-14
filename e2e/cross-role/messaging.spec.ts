import { test, expect } from "../helpers/fixtures";
import { smsMessages, notifications, supabaseAdmin } from "../helpers/supabase";

const MSG_IDS = {
  msg1: "aae2ff00-c100-4000-a000-000000000001",
  msg2: "aae2ff00-c100-4000-a000-000000000002",
  notif1: "aae2ff00-c100-4000-a000-000000000010",
};

test.describe("Messaging between users", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(async () => {
    for (const id of [MSG_IDS.msg1, MSG_IDS.msg2]) {
      await smsMessages.delete(id).catch(() => {});
    }
    await notifications.delete(MSG_IDS.notif1).catch(() => {});
  });

  test("create SMS messages between guest and renter via DB", async ({
    testIds,
  }) => {
    const msg = await smsMessages.create({
      id: MSG_IDS.msg1,
      from_user_id: testIds.guest,
      to_user_id: testIds.renter,
      property_id: testIds.apartment,
      message: "E2E: გამარჯობა, ხელმისაწვდომია?",
      is_read: false,
    });
    expect(msg.id).toBe(MSG_IDS.msg1);
    expect(msg.is_read).toBe(false);

    const reply = await smsMessages.create({
      id: MSG_IDS.msg2,
      from_user_id: testIds.renter,
      to_user_id: testIds.guest,
      property_id: testIds.apartment,
      message: "E2E: დიახ, ხელმისაწვდომია!",
      is_read: false,
    });
    expect(reply.id).toBe(MSG_IDS.msg2);
  });

  test("create notification for new message", async ({ testIds }) => {
    const notif = await notifications.create({
      id: MSG_IDS.notif1,
      user_id: testIds.renter,
      type: "message",
      title: "ახალი შეტყობინება",
      message: "E2E Guest-მა გამოგიგზავნათ შეტყობინება",
      is_read: false,
    });
    expect(notif.is_read).toBe(false);
  });

  test("mark message as read via DB", async () => {
    const updated = await smsMessages.update(MSG_IDS.msg1, { is_read: true });
    expect(updated.is_read).toBe(true);
  });

  test("mark notification as read via DB", async () => {
    const updated = await notifications.update(MSG_IDS.notif1, {
      is_read: true,
    });
    expect(updated.is_read).toBe(true);
  });

  test("verify unread message count decreases", async ({ testIds }) => {
    // msg1 was TO renter, now marked as read
    // msg2 was TO guest, still unread
    const { data: renterUnread, error: e1 } = await supabaseAdmin
      .from("sms_messages")
      .select("id")
      .eq("to_user_id", testIds.renter)
      .eq("is_read", false);
    expect(e1).toBeNull();
    // msg1 should no longer be in renter's unread
    const renterUnreadIds = renterUnread?.map((m) => m.id) ?? [];
    expect(renterUnreadIds).not.toContain(MSG_IDS.msg1);

    // msg2 should still be in guest's unread
    const { data: guestUnread, error: e2 } = await supabaseAdmin
      .from("sms_messages")
      .select("id")
      .eq("to_user_id", testIds.guest)
      .eq("is_read", false);
    expect(e2).toBeNull();
    const guestUnreadIds = guestUnread?.map((m) => m.id) ?? [];
    expect(guestUnreadIds).toContain(MSG_IDS.msg2);
  });
});
