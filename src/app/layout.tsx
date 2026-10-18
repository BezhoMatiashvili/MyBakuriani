import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IS_INDEXABLE, SITE_URL } from "@/lib/seo/site";

export const metadata: Metadata = {
  // Resolves relative og:image / canonical URLs to absolute (required for OG).
  metadataBase: new URL(SITE_URL),
  title: "MyBakuriani",
  description:
    "ბაკურიანის ციფრული პლატფორმა: ბინები, სასტუმროები, კოტეჯები, რესტორნები, ტრანსფერი და სერვისები ერთ სივრცეში.",
  applicationName: "MyBakuriani",
  // Only the canonical host is indexable (C40): staging, previews and local
  // builds say noindex in the document as well as in the X-Robots-Tag header
  // middleware sets. A page that exports its own `robots` replaces this object.
  robots: IS_INDEXABLE
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "MyBakuriani",
    locale: "ka_GE",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-default.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

// The <html>/<body> tags live in `[locale]/layout.tsx` so the document language
// is set per-locale and pages can be statically rendered (ISR). This root layout
// only carries global metadata + styles and passes children through.
// `global-error.tsx` renders its own <html>/<body>.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
