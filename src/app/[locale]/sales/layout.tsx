import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("sales"),
    description: t("salesDesc"),
  };
}

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
