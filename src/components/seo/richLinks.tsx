import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Rich-text tags the SEO copy may use (messages: CategoryIntro, HomeAbout,
// Guide). Each tag is a real <a href> to a public page, so the copy doubles as
// internal links Google can crawl (C40). `guide` is the resort guide.
const TAG_HREFS = {
  apartments: "/apartments",
  hotels: "/hotels",
  sales: "/sales",
  food: "/food",
  transport: "/transport",
  entertainment: "/entertainment",
  services: "/services",
  employment: "/employment",
  blog: "/blog",
  faq: "/faq",
  home: "/",
  guide: "/bakuriani",
  skiLifts: "/bakuriani/ski-lifts",
  gettingThere: "/bakuriani/getting-there",
  didveli: "/bakuriani/didveli",
  kokhta: "/bakuriani/kokhta",
  centri: "/bakuriani/centri",
  // "25ianebi" cannot start a rich-text tag name.
  z25: "/bakuriani/25ianebi",
} as const;

const LINK_CLASS =
  "font-semibold text-[#2563EB] underline-offset-2 hover:underline";

export const richLinks = Object.fromEntries(
  Object.entries(TAG_HREFS).map(([tag, href]) => [
    tag,
    (chunks: ReactNode) => (
      <Link href={href} className={LINK_CLASS}>
        {chunks}
      </Link>
    ),
  ]),
) as Record<keyof typeof TAG_HREFS, (chunks: ReactNode) => ReactNode>;

// The lift operator's own site, the one external link the guide copy makes.
export const guideLinks = {
  ...richLinks,
  mta: (chunks: ReactNode) => (
    <a
      href="https://mta.ski"
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {chunks}
    </a>
  ),
};
