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
        href: "/dashboard/admin/reviews",
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
        href: "/dashboard/admin/finances",
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
        href: "/dashboard/admin/broadcast",
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
    <aside className="hidden h-screen w-[281px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#020B29] text-[#D1D5DB] lg:flex">
      <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-6">
        <div className="mb-1 flex h-8 items-center text-[#2563EB]">
          <Mountain className="h-5 w-5" strokeWidth={2.4} />
        </div>
        <h2 className="ml-2 text-[20px] font-extrabold leading-none text-white">
          <span className="text-[#F97316]">My</span>Bakuriani
        </h2>
      </div>

      <nav className="flex-1 space-y-0 overflow-y-auto px-4 py-5 pb-2">
        {sections.map((section) => (
          <div key={section.title} className="mb-4 last:mb-0">
            <p className="px-3 pb-1.5 pt-4 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5C6D8F] first:pt-1">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isAdminHomeItem = item.href === "/dashboard/admin";
                const isActive = isAdminHomeItem
                  ? currentPath === item.href
                  : currentPath === item.href ||
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
                        "group flex h-10 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors",
                        isActive
                          ? "bg-[#052060] text-[#2E79FF] font-bold shadow-[inset_0_0_0_1px_rgba(37,99,235,0.2)]"
                          : "text-[#8D9BB7] hover:bg-[#0E1C45] hover:text-[#DCE6FB]",
                      )}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <span className="min-w-6 rounded-md bg-[#EF4444] px-2 py-1 text-center text-[11px] font-extrabold leading-none text-white shadow-sm">
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

      <div className="flex h-[88px] shrink-0 items-center border-t border-white/10 bg-[#020B29] p-4">
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-[#28406D] bg-[#172947] px-4 text-[14px] font-bold text-[#EAF1FF] transition-colors hover:bg-[#1D345A]"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
          გასვლა
        </button>
      </div>
    </aside>
  );
}
