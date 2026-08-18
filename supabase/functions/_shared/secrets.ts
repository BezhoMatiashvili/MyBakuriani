import { timingSafeEqual } from "jsr:@std/crypto@1.1.0/timing-safe-equal";

const encoder = new TextEncoder();

/**
 * Compares bearer/shared secrets without leaking a matching prefix or length.
 * Both inputs are digested first so timingSafeEqual always receives 32 bytes.
 */
export async function secretsEqual(
  actual: string,
  expected: string,
): Promise<boolean> {
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(actualDigest, expectedDigest);
}
