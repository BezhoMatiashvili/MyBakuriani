import type { User } from "@supabase/supabase-js";

type ClaimsResult = {
  data: { claims?: { sub?: unknown; email?: unknown } | null } | null;
  error: unknown;
};

type SessionResult = {
  data: { session: { user: User } | null };
};

export type SessionIdentityVerifier = {
  getClaims(): Promise<ClaimsResult>;
  getSession(): Promise<SessionResult>;
};

export type VerifiedSessionIdentity = {
  id: string;
  email?: string;
};

/**
 * Recovers the cookie-backed user only after cryptographically verifying the
 * access token and matching its subject to the embedded session user.
 *
 * getSession() alone only parses client-controlled cookie storage and must
 * never be used as an authorization identity.
 */
export async function getVerifiedSessionUser(
  auth: SessionIdentityVerifier,
): Promise<VerifiedSessionIdentity | null> {
  try {
    const { data: claimsData, error: claimsError } = await auth.getClaims();
    const subject = claimsData?.claims?.sub;
    if (claimsError || typeof subject !== "string" || !subject) return null;

    const {
      data: { session },
    } = await auth.getSession();
    if (session?.user.id !== subject) return null;

    // Return only signed claim values. The cookie's embedded User object is not
    // authenticated independently and may contain attacker-edited metadata.
    const email = claimsData?.claims?.email;
    return {
      id: subject,
      ...(typeof email === "string" ? { email } : {}),
    };
  } catch {
    // This is a retry path for an already-failed Auth request. Any secondary
    // verification failure must fail closed without turning the render into a 500.
    return null;
  }
}
