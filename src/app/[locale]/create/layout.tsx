import { getTranslations } from "next-intl/server";
import { CreateHeader } from "@/components/layout/CreateHeader";

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
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <CreateHeader />
      <main className="flex-1">{children}</main>
      <footer className="py-6 text-center">
        <p className="text-[11px] font-medium text-[#94A3B8]">
          © MyBakuriani.ge Property Management Portal
        </p>
      </footer>
    </div>
  );
}
