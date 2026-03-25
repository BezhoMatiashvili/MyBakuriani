import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "აპარტამენტები ბაკურიანში — MyBakuriani",
  description:
    "იქირავე აპარტამენტი ბაკურიანში. პრემიუმ ბინები, კოტეჯები და ვილები ვერიფიცირებული მესაკუთრეებისგან.",
};

export default function ApartmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
