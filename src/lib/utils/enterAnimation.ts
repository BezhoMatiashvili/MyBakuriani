import type { CSSProperties } from "react";

// CSS stand-ins for the framer-motion entrance fades the detail pages used:
// same 0.4s, same easing (a framer tween given only a duration eases out,
// cubic-bezier(0, 0, 0.58, 1), which is CSS ease-out), same per-block delays.
// A CSS animation runs from first paint; framer's only started after
// hydration, so the server-rendered page sat at opacity 0 until its JS had run.
// Keyframes are in globals.css; `backwards` keeps a delayed block hidden until
// its turn. Unlike ScrollReveal's mb-reveal these also run under
// prefers-reduced-motion, as the framer fades did.

/** Fade in while rising 20px. */
export function enterUp(delay = 0): CSSProperties {
  return { animation: `mb-enter-up 0.4s ease-out ${delay}s backwards` };
}

/** Fade in while sliding 20px leftwards. */
export function enterLeft(delay = 0): CSSProperties {
  return { animation: `mb-enter-left 0.4s ease-out ${delay}s backwards` };
}

/**
 * The listing cards' entrance: fade in while rising 16px, 0.3s. It animates
 * `translate`, not `transform`, so framer's hover scale (an inline transform)
 * still combines with it mid-entrance, as when framer ran both.
 */
export const cardEnter: CSSProperties = {
  animation: "mb-card-enter 0.3s ease-out backwards",
};
