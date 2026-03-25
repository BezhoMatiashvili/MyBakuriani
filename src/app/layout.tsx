import "./globals.css";
import type { Metadata } from "next";
import { Noto_Sans_Georgian } from "next/font/google";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyBakuriani — პრემიუმ გაქირავება ბაკურიანში",
  description:
    "პრემიუმ უძრავი ქონების და გაქირავების პლატფორმა ბაკურიანში. მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ka" className={cn("font-sans", notoSansGeorgian.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Navbar />
        <main className="min-h-[calc(100vh-80px)]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
