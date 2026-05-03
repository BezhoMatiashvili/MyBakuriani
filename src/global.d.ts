import type { routing } from "@/i18n/routing";

declare module "use-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
  }
}

export {};
