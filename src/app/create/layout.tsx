import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyBakuriani — განცხადების დამატება",
  description: "დაამატეთ ახალი განცხადება MyBakuriani პლატფორმაზე.",
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
