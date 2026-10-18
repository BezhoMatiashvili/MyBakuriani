// Noise for the hero overlays that sit at 3-4% opacity. Inline, so it costs no
// request. The remote Unsplash photo it replaces was a third-party connection on
// the hero's critical path and, because Chrome counts a near-transparent
// background image as a paint, it became the LCP element of /apartments,
// /hotels and /sales (4.6 s on /sales under mobile throttling; C40).
export const HERO_NOISE_BACKGROUND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")";
