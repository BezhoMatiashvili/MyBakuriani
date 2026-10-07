import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { getAdminStats } from "@/lib/admin/getAdminStats";
import { countryNames } from "@/lib/analytics/cities";
import AnalyticsDashboard from "@/components/admin/analytics/AnalyticsDashboard";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
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
