"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CABINET_SWITCHER_ITEMS } from "@/components/layout/CabinetSwitcher";

interface MobileServiceSwitcherGridProps {
  activeCabinetKey: string;
  availableCabinets: string[];
  onSelect?: () => void;
  className?: string;
}

/** Permission-aware business-cabinet picker shared by mobile dashboard sheets. */
export function MobileServiceSwitcherGrid({
  activeCabinetKey,
  availableCabinets,
  onSelect,
  className,
}: MobileServiceSwitcherGridProps) {
  const t = useTranslations("DashboardSidebar");
  const items = CABINET_SWITCHER_ITEMS.filter(
    (item) => item.key !== "guest" && availableCabinets.includes(item.key),
  );

  return (
    <section
      data-testid="mobile-service-switcher"
      className={cn(
        "rounded-[18px] border border-[#E2E8F0] bg-[#F8FAFC] p-3",
        className,
      )}
    >
      {items.length > 0 && (
        <>
          <p className="mb-3 text-[12px] font-extrabold text-[#475569]">
            {t("serviceSwitcher")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => {
              const active = item.key === activeCabinetKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onSelect}
                  className={cn(
                    "flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-[12px] font-bold transition-colors",
                    active
                      ? "border-[#2563EB] bg-[#2563EB] text-white"
                      : "border-[#D9E2EC] bg-white text-[#334155] hover:border-[#93C5FD] hover:bg-[#EFF6FF]",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {t(`switcher.${item.labelKey}`)}
                  </span>
                  {active && (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full bg-white"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
      <Link
        href="/dashboard/guest"
        onClick={onSelect}
        className={cn(
          "block rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-center",
          items.length > 0 && "mt-2",
        )}
      >
        <p className="text-[13px] font-bold text-[#2563EB]">
          {t("switcher.guestMode")}
        </p>
        <p className="mt-0.5 text-[10px] font-medium text-[#64748B]">
          {t("switcher.guestModeDesc")}
        </p>
      </Link>
    </section>
  );
}
