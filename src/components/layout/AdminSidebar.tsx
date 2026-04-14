"use client";

import { Mountain } from "lucide-react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  verificationAlerts?: number;
  onSignOut: () => void;
}

interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "ანალიტიკა",
    items: [
      { label: "მთავარი გვერდი", href: "/dashboard/admin" },
      {
        label: "ვერიფიკაციები",
        href: "/dashboard/admin/verifications",
        badge: 3,
      },
      {
        label: "მომხმარებლები",
        href: "/dashboard/admin/clients",
      },
      {
        label: "განცხადებები",
        href: "/dashboard/admin/listings",
      },
    ],
  },
  {
    title: "ოპერაციები",
    items: [
      {
        label: "შეფასებები",
        href: "/dashboard/admin/analytics",
      },
      {
        label: "ტარიფები და პაკეტები",
        href: "/dashboard/admin/settings",
      },
    ],
  },
  {
    title: "მონეტიზაცია",
    items: [
      {
        label: "ფინანსები",
        href: "/dashboard/admin/analytics",
      },
      {
        label: "რეკლამები",
        href: "/dashboard/admin/moderation",
      },
    ],
  },
  {
    title: "მარკეტინგი",
    items: [
      {
        label: "მასობრივი დაგზავნა",
        href: "/dashboard/admin/moderation",
      },
      {
        label: "პრომო კოდები",
        href: "/dashboard/admin/promocodes",
      },
      { label: "სიახლეები", href: "/dashboard/admin/seo" },
    ],
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
}

export function AdminSidebar({
  verificationAlerts = 3,
  onSignOut,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);

  return (
    <aside className="hidden h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-[16px] bg-[#0B1120] text-[#D1D5DB] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] lg:flex">
      <div className="flex h-20 items-center px-8">
        <div className="mb-2 flex h-8 items-center text-[#2563EB]">
          <Mountain className="h-6 w-6" strokeWidth={2.4} />
        </div>
        <h2 className="ml-2 text-[30px] font-extrabold leading-none text-white">
          <span className="text-[#F97316]">My</span>Bakuriani
        </h2>
      </div>

      <nav className="flex-1 space-y-0 overflow-y-auto px-4 py-5">
        {sections.map((section) => (
          <div key={section.title} className="mb-3 last:mb-0">
            <p className="px-4 pb-1 pt-4 text-[10px] font-black uppercase tracking-[1px] text-[#64748B] first:pt-1">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  currentPath === item.href ||
                  currentPath.startsWith(`${item.href}/`);
                const badge =
                  item.href === "/dashboard/admin/verifications"
                    ? verificationAlerts
                    : item.badge;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex h-10 items-center gap-3 rounded-xl px-4 text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-[rgba(37,99,235,0.15)] text-[#3B82F6] font-bold"
                          : "text-[#94A3B8] hover:bg-[#0F172A] hover:text-white",
                      )}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <span
                          className={cn(
                            "min-w-5 rounded px-2 py-0.5 text-center text-[10px] font-bold shadow-sm",
                            isActive
                              ? "bg-[#EF4444] text-white"
                              : "bg-[#EF4444] text-white",
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex h-[90px] items-center border-t border-white/5 bg-[#0B1120] p-6">
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-[#334155] bg-[#1E293B] px-3 text-sm font-bold text-white transition-colors hover:bg-[#334155]"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
          გასვლა
        </button>
      </div>
    </aside>
  );
}
