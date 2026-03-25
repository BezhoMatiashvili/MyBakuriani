import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "სასტუმროები ბაკურიანში — MyBakuriani",
  description:
    "აღმოაჩინე საუკეთესო სასტუმროები ბაკურიანში. შეადარე ფასები, რეიტინგები და დაჯავშნე ონლაინ.",
};

export default function HotelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
