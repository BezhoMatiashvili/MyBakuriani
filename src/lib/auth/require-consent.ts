import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasAcceptedRequiredPolicies } from "@/lib/consent/channels";

export const CONSENT_REQUIRED_PATH = "/consent-required";

/**
 * Server-side backstop for the blocking consent dialog.
 *
 * ConsentGate (mounted in LocaleShell) is the primary UX and covers every
 * route, but a client overlay is bypassable, so the two trees that let a user
 * ACT rather than browse - /dashboard/* and /create/* - re-check server-side.
 *
 * Deliberately NOT in src/middleware.ts: middleware never touches the database
 * (it verifies the JWT locally via getClaims() precisely to avoid a
 * cross-region round trip), and adding a per-request profile read there would
 * regress the latency and Cloudflare-caching posture C2/C28 document.
 *
 * A null profile is NOT treated as missing consent: that means the user has
 * authenticated but never completed /auth/register, which the register wizard
 * itself handles. Redirecting here would fight it.
 */
export async function requireConsent(): Promise<void> {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile) return;
  if (hasAcceptedRequiredPolicies(profile)) return;
  redirect(CONSENT_REQUIRED_PATH);
}
