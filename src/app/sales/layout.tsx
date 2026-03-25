import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ინვესტიცია ბაკურიანში — MyBakuriani",
  description:
    "შეიძინე უძრავი ქონება ბაკურიანში. საინვესტიციო შესაძლებლობები, ROI კალკულატორი და ბაზრის ანალიზი.",
};

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
