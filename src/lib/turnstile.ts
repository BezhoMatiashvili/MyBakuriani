/** Server-side Cloudflare Turnstile verification for abuse-prone anonymous actions. */
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return false;
  }

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") form.set("remoteip", remoteIp);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      },
    );
    const result = (await response.json()) as { success?: unknown };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
}
