import { redirect } from "next/navigation";

// The combined service dashboard was split into per-category dashboards
// (/dashboard/{employment,transport,entertainment,services}). This legacy route
// now forwards to /dashboard, which re-resolves to the user's role dashboard.
// The folder's loadData.ts / ServiceDashboardClient.tsx and the balance/orders/
// notifications/parameters sub-pages remain as the shared implementation reused
// by the four split routes.
export default function ServiceDashboardRedirect() {
  redirect("/dashboard");
}
