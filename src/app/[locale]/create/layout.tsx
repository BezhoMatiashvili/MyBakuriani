import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return {
    title: t("create"),
    description: t("createDesc"),
  };
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
