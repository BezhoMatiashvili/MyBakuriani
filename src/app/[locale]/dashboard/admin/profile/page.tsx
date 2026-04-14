import { redirect } from "@/i18n/navigation";

export default function AdminProfilePage() {
  redirect({ href: "/dashboard/admin/settings", locale: "en" });
}
