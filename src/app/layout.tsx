import "./globals.css";
import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { getLocale } from "next-intl/server";

const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyBakuriani",
  description: "MyBakuriani — Premium real estate platform in Bakuriani",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={cn("font-sans", notoSansGeorgian.variable)}>
      <body className="flex min-h-screen flex-col bg-white text-[#1E293B] antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
