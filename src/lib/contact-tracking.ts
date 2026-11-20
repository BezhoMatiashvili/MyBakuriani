// Fires a "user clicked Call / WhatsApp on a listing" event so the listing
// owner can later send the visitor SMS (subject to admin approval and a
// 30-day window). Anonymous visitors and clicks without listing context are
// silently skipped — the API enforces the same rules server-side.

import { trackGa } from "@/lib/ga/track";

export type ContactChannel = "call" | "whatsapp";

export type ContactTrackParams = {
  channel: ContactChannel;
  propertyId?: string | null;
  serviceId?: string | null;
};

export function trackContactClick({
  channel,
  propertyId,
  serviceId,
}: ContactTrackParams): void {
  if (!propertyId && !serviceId) return;
  if (typeof window === "undefined") return;
  // Google Analytics (C62): which button and which kind of listing, no id.
  trackGa("contact_click", {
    channel,
    listing_type: propertyId ? "property" : "service",
  });

  try {
    void fetch("/api/contact/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        property_id: propertyId ?? null,
        service_id: serviceId ?? null,
        channel,
      }),
    }).catch(() => {
      // Fire-and-forget — never block the user's call/wa.me navigation.
    });
  } catch {
    // ignore
  }
}
