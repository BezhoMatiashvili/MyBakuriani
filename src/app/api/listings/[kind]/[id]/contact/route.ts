import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isUuid } from "@/lib/utils/uuid";
import { normalizeE164Phone } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

type ContactRequest = { turnstile_token?: string; device_id?: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isUuid(id) || (kind !== "property" && kind !== "service")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as ContactRequest | null;
  const ip = getClientIp(req);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const device = typeof body?.device_id === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(body.device_id)
    ? body.device_id
    : "no-device";
  // Each signal is part of the key: a disposable browser id cannot evade the
  // trusted proxy IP limit, and an IP alone cannot cheaply enumerate a listing.
  const subject = user?.id ?? `anon:${device}`;
  if (!(await checkRateLimit(`listing-contact:${ip}:${subject}:${kind}:${id}`, 8, 60 * 60_000))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!user && !(await verifyTurnstile(body?.turnstile_token, ip))) {
    return Response.json({ error: "verification_required" }, { status: 403 });
  }
  const db = createServiceClient();
  const table = kind === "property" ? "properties" : "services";
  const { data } = await db.from(table).select("phone, whatsapp, profiles!inner(phone)").eq("id", id).eq("status", "active").maybeSingle();
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const row = data as { phone: string | null; whatsapp: string | null; profiles: { phone: string | null } | null };
  // This table is intentionally service-write-only.  It records the reveal,
  // not the revealed value, and makes rate-limit/audit investigations possible.
  await (db.from as unknown as (table: "contact_reveal_events") => {
    insert(value: Record<string, unknown>): PromiseLike<unknown>;
  })("contact_reveal_events").insert({
    listing_id: id,
    listing_type: kind,
    account_id: user?.id ?? null,
    device_id: user ? null : device,
    client_ip: ip,
  });
  // This is the only public contact representation: a deliberate detail
  // lookup, individually rate-limited and never part of list/search payloads.
  return Response.json({ phone: normalizeE164Phone(row.phone ?? row.profiles?.phone), whatsapp: normalizeE164Phone(row.whatsapp) });
}
