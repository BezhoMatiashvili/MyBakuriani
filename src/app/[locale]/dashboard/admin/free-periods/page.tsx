import FreePeriodsPage from "@/components/admin/free-periods/FreePeriodsPage";

// Admin free periods (C53). The layout gates the admin (dashboard/admin/layout);
// every number and write goes through /api/admin/free-periods (requireAdmin),
// so this page reads nothing with the service role.

export default function AdminFreePeriodsRoute() {
  return <FreePeriodsPage />;
}
