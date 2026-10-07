import { NextRequest, after } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordAnalyticsEvent } from "@/lib/analytics/events";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { normalizeE164Phone } from "@/lib/security";
import { isTurnstileConfigured, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

type ContactRequest = {
  turnstile_token?: string;
  device_id?: string;
  /** Which button asked (C49): CallButton "call", WhatsAppButton "whatsapp". */
  channel?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  // The listing lookup does not depend on who is asking, so it starts now and
  // runs while the auth check and both rate-limit round trips are awaited
  // (each a Singapore->Tokyo hop) instead of after them. The .catch only marks
  // the promise handled for the early 429/403 returns; awaiting it below still
  // throws exactly as the inline query used to.
  const db = createServiceClient();
  type ContactRow = {
    phone: string | null;
    whatsapp: string | null;
    profiles: { phone: string | null } | null;
  };
  const lookup = Promise.resolve(
    kind === "property"
      ? db
          .from("properties")
          .select("phone, whatsapp, profiles!properties_owner_id_fkey(phone)")
          .eq("id", id)
          .eq("status", "active")
          .maybeSingle()
      : db
          .from("services")
          .select("phone, whatsapp, profiles!services_owner_id_fkey(phone)")
          .eq("id", id)
          .eq("status", "active")
          .maybeSingle(),
  );
  lookup.catch(() => {});
  // C31: a rental whose owner holds no active seasonal membership is hidden
  // from the public, and so is its number. public_properties is the one
  // definition of "publicly visible", so the check reads it, in parallel.
  const shown =
    kind === "property"
      ? Promise.resolve(
          db.from("public_properties").select("id").eq("id", id).maybeSingle(),
        )
      : null;
  shown?.catch(() => {});
  const body = (await req.json().catch(() => null)) as ContactRequest | null;
  const ip = getClientIp(req);
  const user = await getCurrentUser();
  const device =
    typeof body?.device_id === "string" &&
    /^[A-Za-z0-9_-]{16,128}$/.test(body.device_id)
      ? body.device_id
      : "no-device";
  // The subject is the account when there is one, otherwise the trusted proxy
  // IP. It is deliberately NOT device_id any more: that is client-supplied, so
  // a scraper minted a fresh budget per request just by rotating it and the
  // limit bound only honest clients. device_id is still recorded below for
  // audit. Keying signed-in users on their own id also means anonymous traffic
  // from a carrier NAT cannot starve an authenticated user sharing that egress.
  const subject = user ? `user:${user.id}` : `ip:${ip}`;
  // Two buckets, because the per-listing one alone bounds nothing: with ~49
  // active listings a scraper stays inside an 8/listing budget while taking the
  // entire catalogue. The cross-listing budget is what makes bulk harvesting
  // slow and visible. It is set well above real browsing (a visitor reveals a
  // handful of numbers, not 30) so it should never fire for a human.
  // NOTE: this is friction, not prevention — only Turnstile actually stops a
  // distributed scrape, and TURNSTILE_SECRET_KEY is currently unset (see C16).
  const withinLimits =
    (await checkRateLimit(
      `listing-contact:${subject}:${kind}:${id}`,
      8,
      60 * 60_000,
    )) &&
    (await checkRateLimit(`listing-contact-all:${subject}`, 30, 60 * 60_000));
  if (!withinLimits) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  // Enforced only when a secret exists, so an unconfigured Turnstile degrades to
  // "IP-limited but unchallenged" rather than "403 for every anonymous visitor".
  // Setting TURNSTILE_SECRET_KEY re-arms this with no code change.
  if (
    !user &&
    isTurnstileConfigured() &&
    !(await verifyTurnstile(body?.turnstile_token, ip))
  ) {
    return Response.json({ error: "verification_required" }, { status: 403 });
  }
  const { data, error } = await lookup;
  const row = data as ContactRow | null;
  const lookupError: { code?: string; message?: string } | null = error;

  if (lookupError) {
    console.error("Listing contact lookup failed", {
      kind,
      id,
      code: lookupError.code,
    });
    return Response.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  if (shown) {
    const { data: visible, error: shownError } = await shown;
    if (shownError) {
      console.error("Listing contact visibility lookup failed", {
        kind,
        id,
        code: shownError.code,
      });
      return Response.json({ error: "lookup_failed" }, { status: 500 });
    }
    if (!visible) return Response.json({ error: "not_found" }, { status: 404 });
  }
  // This table is intentionally service-write-only.  It records the reveal,
  // not the revealed value, and makes rate-limit/audit investigations possible.
  // Its result was never checked, so it runs after the response is sent
  // rather than holding the number back for another round trip (C22: reveal
  // counts in listing analytics become eventual by a few milliseconds).
  // The channel splits reveals into the admin analytics' calls and messages
  // (C49); older clients send none, so the column stays nullable.
  const channel =
    body?.channel === "call" || body?.channel === "whatsapp"
      ? body.channel
      : null;
  after(async () => {
    await (
      db.from as unknown as (table: "contact_reveal_events") => {
        insert(value: Record<string, unknown>): PromiseLike<unknown>;
      }
    )("contact_reveal_events").insert({
      listing_id: id,
      listing_type: kind,
      account_id: user?.id ?? null,
      device_id: user ? null : device,
      client_ip: ip,
      channel,
    });
    if (channel) {
      await recordAnalyticsEvent(req, {
        name: channel === "call" ? "call" : "message",
        entityType: kind,
        entityId: id,
        userId: user?.id ?? null,
      });
    }
  });
  // This is the only public contact representation: a deliberate detail
  // lookup, individually rate-limited and never part of list/search payloads.
  return Response.json({
    phone:
      normalizeE164Phone(row.phone) ?? normalizeE164Phone(row.profiles?.phone),
    whatsapp: normalizeE164Phone(row.whatsapp),
  });
}
