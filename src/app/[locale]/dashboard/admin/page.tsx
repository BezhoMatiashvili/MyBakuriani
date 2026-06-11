import { getAdminStats } from "@/lib/admin/getAdminStats";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const data = await getAdminStats();

  return <AdminDashboardClient initialStats={data} />;
}
