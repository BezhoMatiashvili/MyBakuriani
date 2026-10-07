"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Send,
  Tag,
  UserCheck,
} from "lucide-react";
import { formatPrice, formatNumber } from "@/lib/utils/format";
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

  // Business numbers from admin_overview_stats (C26). Visits, visitors and
  // listing activity are in the analytics dashboard below, per period.
  const cards = [
    {
      label: t("netRevenue"),
      value: formatPrice(Number(initialStats?.net_revenue ?? 0)),
      icon: Banknote,
    },
    {
      label: t("registeredUsers"),
      value: formatNumber(Number(initialStats?.registered_users ?? 0)),
      icon: UserCheck,
    },
    {
      label: t("calendarFrequency"),
      value: `${Math.round(Number(initialStats?.occupancy_rate_pct ?? 0))}%`,
      icon: CalendarDays,
    },
    {
      label: t("avgNightPrice"),
      value: formatPrice(
        Math.round(Number(initialStats?.average_nightly_price ?? 0)),
      ),
      icon: Tag,
    },
    {
      label: t("funnelRequestSends"),
      value: formatNumber(Number(initialStats?.bookings_7d ?? 0)),
      icon: Send,
    },
    {
      label: t("funnelCompleted"),
      value: formatNumber(Number(initialStats?.stays_completed_7d ?? 0)),
      icon: CalendarCheck,
    },
  ];

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

      <section aria-labelledby="admin-business-title">
        <h2
          id="admin-business-title"
          className="mb-3 text-[16px] font-black tracking-[0.5px] text-[#64748B]"
        >
          {t("businessTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => (
            <div
              key={card.label}
              data-testid="admin-business-card"
              className="min-w-0 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-[0px_2px_6px_rgba(15,23,42,0.03)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold leading-4 text-[#64748B]">
                  {card.label}
                </p>
                <card.icon className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
              </div>
              <p className="mt-2 truncate text-[24px] font-black leading-8 text-[#0F172A]">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {children}
    </div>
  );
}
