import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  // Resolves relative og:image / canonical URLs to absolute (required for OG).
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://my-bakuriani.vercel.app",
  ),
  title: "MyBakuriani",
  description: "MyBakuriani — Premium real estate platform in Bakuriani",
  openGraph: {
    type: "website",
    siteName: "MyBakuriani",
    locale: "ka",
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
