"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AlertTriangle } from "lucide-react";
import type { AdminStatsData } from "@/lib/admin/getAdminStats";

export default function AdminDashboardClient({
  initialStats,
  children,
}: {
  initialStats: AdminStatsData | null;
  /** The analytics dashboard (C49). */
  children: ReactNode;
}) {
  const t = useTranslations("AdminDashboard");
  const pendingOver24 = Number(initialStats?.pending_over_24h ?? 0);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-7 pb-10">
      <div className="pt-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-2 text-[14px] font-medium leading-[21px] text-[#64748B]">
          {t("subtitle")}
        </p>
      </div>

      {pendingOver24 > 0 && (
        <div className="flex flex-col gap-4 rounded-[18px] bg-[#EF2D2D] px-6 py-4 text-white shadow-[0px_8px_20px_rgba(239,45,45,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-lg font-semibold leading-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span>{t("alert", { count: pendingOver24 })}</span>
          </div>
          <Link
            href="/dashboard/admin/verifications"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#EF2D2D] transition-colors hover:bg-[#F8FAFC]"
          >
            {t("review")}
          </Link>
        </div>
      )}

      {children}
    </div>
  );
}
