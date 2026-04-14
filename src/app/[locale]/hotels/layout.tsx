import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("hotels"),
    description: t("hotelsDesc"),
  };
}

export default function HotelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
