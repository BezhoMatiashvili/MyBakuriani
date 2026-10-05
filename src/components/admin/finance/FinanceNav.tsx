"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// The finance module's own menu (C42, spec §1-20): one entry per register,
// report and tool. The admin sidebar keeps a single "Finances" item.

const BASE = "/dashboard/admin/finances";

const ITEMS = [
  { key: "dashboard", href: BASE },
  { key: "revenue", href: `${BASE}/revenue` },
  { key: "payments", href: `${BASE}/payments` },
  { key: "refunds", href: `${BASE}/refunds` },
  { key: "owners", href: `${BASE}/owners` },
  { key: "expenses", href: `${BASE}/expenses` },
  { key: "invoices", href: `${BASE}/invoices` },
  { key: "tax", href: `${BASE}/tax` },
  { key: "threshold", href: `${BASE}/threshold` },
  { key: "vat", href: `${BASE}/vat` },
  { key: "documents", href: `${BASE}/documents` },
  { key: "export", href: `${BASE}/export` },
  { key: "settings", href: `${BASE}/settings` },
] as const;

export default function FinanceNav() {
  const t = useTranslations("AdminFinances");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("nav.label")}
      className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
    >
      <ul className="flex w-max gap-2">
        {ITEMS.map((item) => {
          const active =
            item.href === BASE
              ? pathname === BASE
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-xl px-4 text-[13px] font-bold transition-colors",
                  active
                    ? "bg-[#0F172A] text-white"
                    : "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
                )}
              >
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
