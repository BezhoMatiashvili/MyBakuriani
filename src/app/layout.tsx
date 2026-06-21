import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-sans",
  display: "swap",
});

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let locale = routing.defaultLocale;
  try {
    locale = await getLocale();
  } catch {
    // Rare: next-intl context missing during certain error/edge renders
  }

  return (
    <html lang={locale} className={cn("font-sans", notoSansGeorgian.variable)}>
      <body className="flex min-h-dvh flex-col bg-white text-[#1E293B] antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
