import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyBakuriani — ავტორიზაცია",
  description: "შედით ან დარეგისტრირდით MyBakuriani პლატფორმაზე.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
