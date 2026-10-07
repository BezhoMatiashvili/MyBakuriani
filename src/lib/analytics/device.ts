// Device class of an analytics hit (C49, spec §8): mobile, tablet or desktop.
// Derived on the server from the User-Agent (never stored) plus the browser's
// maxTouchPoints, which is the only way to tell an iPad: iPadOS Safari sends a
// desktop "Macintosh" User-Agent. Pure (type imports only).
import type { Device } from "./model";

const TABLET =
  /\b(iPad|Tablet|PlayBook|Silk|Kindle|Nexus (7|9|10)|SM-[TXP]\d+|Lenovo TB|KF[A-Z]{2,4})\b/i;
const MOBILE =
  /\b(Mobi|iPhone|iPod|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile)\b|Android.*Mobile/i;

export function classifyDevice(
  userAgent: string | null | undefined,
  maxTouchPoints?: number | null,
): Device {
  const ua = userAgent ?? "";
  if (TABLET.test(ua)) return "tablet";
  // Android tablets drop "Mobile" from the User-Agent.
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (MOBILE.test(ua)) return "mobile";
  if (/Macintosh/i.test(ua) && (maxTouchPoints ?? 0) > 1) return "tablet";
  return "desktop";
}
