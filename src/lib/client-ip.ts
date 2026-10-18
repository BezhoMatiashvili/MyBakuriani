/**
 * The client's address, for rate-limit keys and the listing-view dedup
 * (contract C16). Never accept user input for it. Load-bearing: some limits are
 * keyed on this value ALONE.
 *
 * HISTORY — read this before "simplifying" getClientIp.
 *
 * 1. First X-Forwarded-For hop: a spoof bypass. DigitalOcean App Platform's
 *    edge APPENDS to any client-supplied x-forwarded-for rather than replacing
 *    it, so the FIRST entry is attacker-controlled — confirmed live 2026-09-08:
 *    25 requests against the geocode rate limiter (20/60s) each carrying a
 *    distinct spoofed X-Forwarded-For all returned 200, while an unmodified
 *    control hit 429 at request 21 as expected. Do not revert to the first
 *    entry — that is the bypass 6fb6d62 fixed.
 * 2. Last hop alone (6fb6d62, 2026-09-08 until this module): not spoofable, but
 *    not the client either. App Platform's edge is Cloudflare —
 *    `*.ondigitalocean.app` (and staging.mybakuriani.ge, a CNAME to it) resolve
 *    to Cloudflare anycast — so the last hop is the Cloudflare edge that
 *    forwarded the request. Every view event the deployed app recorded since
 *    2026-09-09 carries a 162.158.x.x edge address: everyone behind one edge
 *    shared one bucket, and the one-view-per-IP-per-day dedup merged different
 *    visitors into a single view.
 *
 * Pure module (node:net only, no `@/` imports) so scripts/unit can load it.
 * rateLimit.ts re-exports getClientIp, so its importers are unchanged.
 */
import { BlockList, isIP } from "node:net";

/**
 * Cloudflare's published edge ranges, synced 2026-09-26 from
 * https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
 * Re-sync when Cloudflare changes them: a missing range only makes that edge be
 * keyed as a client (the old one-bucket-per-edge behaviour), but a retired
 * range left here would trust CF-Connecting-IP from whoever holds it next.
 */
export const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

const cloudflare = new BlockList();
for (const cidr of CLOUDFLARE_IPV4_RANGES) {
  const [network, prefix] = cidr.split("/");
  cloudflare.addSubnet(network, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_IPV6_RANGES) {
  const [network, prefix] = cidr.split("/");
  cloudflare.addSubnet(network, Number(prefix), "ipv6");
}

/**
 * Is `ip` a Cloudflare edge address? IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is
 * matched against the IPv4 ranges too; BlockList does that natively.
 */
export function isCloudflareIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return cloudflare.check(ip, "ipv4");
  if (family === 6) return cloudflare.check(ip, "ipv6");
  return false;
}

// One client, one key: "::ffff:203.0.113.5" and "203.0.113.5" are the same host.
function canonical(ip: string): string {
  const mapped = /^::ffff:([\d.]+)$/i.exec(ip);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : ip;
}

/**
 * The /64 an IPv6 client sits in ("2001:db8:1:2::/64"), or null for IPv4,
 * IPv4-mapped and anything that is not an address. One subscriber controls a
 * whole /64 (a handset on mobile, a LAN on fixed lines, a VPS) and can send
 * from any address in it, so a per-address brake alone gives such a host a
 * fresh bucket per request. For rate-limit keys only: geo lookups, Turnstile
 * and the stored client_ip keep the exact address.
 */
export function ipv6Net64(ip: string): string | null {
  if (isIP(ip) !== 6 || /^::ffff:/i.test(ip)) return null;
  let addr = ip.split("%")[0].toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    const o = v4[1].split(".").map(Number);
    addr =
      addr.slice(0, -v4[1].length) +
      ((o[0] << 8) | o[1]).toString(16) +
      ":" +
      ((o[2] << 8) | o[3]).toString(16);
  }
  const [l, r] = addr.split("::");
  const left = l ? l.split(":") : [];
  const right = r === undefined ? null : r ? r.split(":") : [];
  const groups =
    right === null
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return (
    groups
      .slice(0, 4)
      .map((g) => parseInt(g, 16).toString(16))
      .join(":") + "::/64"
  );
}

/**
 * Client address from the proxy chain client → Cloudflare edge → DO ingress →
 * app (inferred from the recorded edge addresses; see C16). The peer is the
 * LAST X-Forwarded-For hop: DO's ingress appends it, so the client cannot
 * choose it.
 *   - Peer is a Cloudflare edge: CF-Connecting-IP (Cloudflare sets it,
 *     replacing any client-supplied value), else the hop Cloudflare appended
 *     just before the peer, else the peer itself (the old per-edge key).
 *   - Any other peer IS the client, and none of its headers are consulted.
 * Never the first hop. DO-Connecting-IP is not trusted (unverified behind
 * Cloudflare).
 */
export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (hops.length > 0) {
    const peer = hops[hops.length - 1];
    if (!isCloudflareIp(peer)) return canonical(peer);
    const connecting = req.headers.get("cf-connecting-ip")?.trim();
    if (connecting && isIP(connecting)) return canonical(connecting);
    const appended = hops[hops.length - 2];
    if (appended && isIP(appended)) return canonical(appended);
    return canonical(peer);
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
