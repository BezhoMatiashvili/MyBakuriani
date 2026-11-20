// Google Analytics (C62): the pure rules, import-free so
// scripts/unit/ga-core.test.mjs can load this file bare (C29).

/**
 * The only events the site sends besides page_view, with the parameters each
 * may carry. No ids, names, phone numbers or typed text: a channel and the
 * listing table at most.
 */
export const GA_EVENTS = {
  sign_up: [],
  contact_reveal: ["channel", "listing_type"],
  contact_click: ["channel", "listing_type"],
  add_to_wishlist: [],
  smart_match_request: [],
  job_application: [],
} as const satisfies Record<string, readonly string[]>;

export type GaEventName = keyof typeof GA_EVENTS;

export type GaEventParams = {
  channel?: "call" | "whatsapp";
  listing_type?: "property" | "service";
};

const PARAM_VALUES: Record<string, readonly string[]> = {
  channel: ["call", "whatsapp"],
  listing_type: ["property", "service"],
};

export function isGaEventName(value: unknown): value is GaEventName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GA_EVENTS, value)
  );
}

/** The parameters that may be sent for this event; anything else is dropped. */
export function gaEventParams(
  name: GaEventName,
  params: GaEventParams | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const key of GA_EVENTS[name] as readonly string[]) {
    const value = (params as Record<string, unknown>)[key];
    if (typeof value === "string" && PARAM_VALUES[key]?.includes(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** gtag.js's own cookies for this measurement ID (_ga, _ga_<id without G->). */
export function gaCookieNames(measurementId: string): string[] {
  return ["_ga", `_ga_${measurementId.replace(/^G-/, "")}`];
}
