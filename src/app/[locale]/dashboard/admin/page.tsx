import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { getAdminStats } from "@/lib/admin/getAdminStats";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { countryNames } from "@/lib/analytics/cities";
import AnalyticsDashboard from "@/components/admin/analytics/AnalyticsDashboard";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  // Layouts and pages render in parallel, so the layout's redirect does not
  // keep this page's output out of the response: check the role here, before
  // the service-role read.
  if (!(await isAdminViewer())) return null;
  const [data, locale] = await Promise.all([getAdminStats(), getLocale()]);

  return (
    <AdminDashboardClient initialStats={data}>
      {/* useSearchParams: the period and filters live in the URL (C49). */}
      <Suspense fallback={null}>
        <AnalyticsDashboard countryNames={countryNames(locale)} />
      </Suspense>
    </AdminDashboardClient>
  );
}
