// Supabase Auth Send SMS hook (C48). Wiring only; the logic is in handler.ts.
// verify_jwt = false (config.toml): Auth calls with a Standard Webhooks
// signature, which handler.ts checks against SEND_SMS_HOOK_SECRET.

import { createServiceClient } from "../_shared/guards.ts";
import { ubillSend } from "../_shared/ubill.ts";
import { handleSendSms, type Reservation } from "./handler.ts";

Deno.serve((req) => {
  const db = createServiceClient();
  return handleSendSms(req, {
    env: (name) => Deno.env.get(name),
    async reserve({ hookId, phone, ip, userId, kind }) {
      const { data, error } = await db.rpc("auth_sms_code_reserve", {
        p_hook_id: hookId,
        p_phone: phone,
        p_ip: ip,
        p_user_id: userId,
        p_kind: kind,
      });
      if (error) throw error;
      return data as Reservation;
    },
    async settle(id, sent, providerMessageId) {
      const { error } = await db.rpc("auth_sms_code_settle", {
        p_id: id,
        p_sent: sent,
        p_provider_message_id: providerMessageId,
      });
      if (error) throw error;
    },
    send: ubillSend,
    log: (message, data) =>
      console.log(message, data ? JSON.stringify(data) : ""),
  });
});
