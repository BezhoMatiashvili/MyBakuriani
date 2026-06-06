import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Single-locale lockdown: the UI is authored in Georgian and ~90% of
  // components render hardcoded Georgian. Serving en/ru via Accept-Language
  // detection produced a broken Georgian+foreign mix that differed per device,
  // so the site is locked to `ka` for a consistent render everywhere.
  // Old /en and /ru URLs are redirected to their ka equivalent in next.config.ts.
  locales: ["ka"],
  defaultLocale: "ka",
  localePrefix: "as-needed",
  localeDetection: false,
});
