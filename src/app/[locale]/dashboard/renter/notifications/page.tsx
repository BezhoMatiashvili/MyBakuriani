"use client";

import { motion } from "framer-motion";
import { Bell, Info, Star, AlertTriangle, BellRing } from "lucide-react";

interface NotificationItem {
  id: string;
  icon: "info" | "star" | "warning" | "lead";
  title: string;
  body: string;
  time: string;
}

// TODO: hook real notifications from Supabase — for now using reference content.
const ITEMS: NotificationItem[] = [
  {
    id: "1",
    icon: "info",
    title: "წარმატებული ვერიფიკაცია",
    body: "თქვენი პროფილის სტატუსი წარმატებით ვერიფიცირდა. ახლა თქვენი ობიექტები საჯაროა.",
    time: "2 სთ-ის წინ",
  },
  {
    id: "2",
    icon: "star",
    title: "ობიექტი დაემატა რჩეულებში",
    body: "მომხმარებელმა (ID: MB-8821) თქვენი ობიექტი დაამატა რჩეულების სიაში.",
    time: "გუშინ",
  },
  {
    id: "3",
    icon: "warning",
    title: "ბალანსი იწურება",
    body: "თქვენს ანგარიშზე დარჩენილია 5 SMS. გთხოვთ შეავსოთ ბალანსი სერვისების შეუფერხებლად მისაღებად.",
    time: "2 დღის წინ",
  },
  {
    id: "4",
    icon: "lead",
    title: "ახალი მოთხოვნა (Lead)",
    body: "სისტემამ იპოვა ახალი მოთხოვნა რომელიც ზუსტად ერგება თქვენს VIP აპარტამენტს.",
    time: "3 დღის წინ",
  },
];

const ICON_STYLES = {
  info: {
    bg: "bg-[#DBEAFE]",
    color: "text-[#2563EB]",
    Icon: Info,
  },
  star: {
    bg: "bg-[#FEF3C7]",
    color: "text-[#F59E0B]",
    Icon: Star,
  },
  warning: {
    bg: "bg-[#FFEDD5]",
    color: "text-[#F97316]",
    Icon: AlertTriangle,
  },
  lead: {
    bg: "bg-[#DCFCE7]",
    color: "text-[#16A34A]",
    Icon: BellRing,
  },
};

export default function RenterNotificationsPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="flex items-center gap-3 text-[36px] font-black leading-[44px] text-[#0F172A]">
          <Bell className="h-8 w-8 text-[#2563EB]" fill="#2563EB" />
          შეტყობინებები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          სისტემური შეტყობინებები და მნიშვნელოვანი სიახლეები.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        <div className="flex items-center justify-between border-b border-[#EEF1F4] px-6 py-4">
          <span className="text-[13px] font-semibold text-[#94A3B8]">
            ბოლო 30 დღე
          </span>
          <button
            type="button"
            className="text-[12px] font-bold text-[#2563EB] hover:underline"
          >
            ყველას ნაკითხულად მონიშვნა
          </button>
        </div>

        <ul>
          {ITEMS.map((item, i) => {
            const style = ICON_STYLES[item.icon];
            const IconCmp = style.Icon;
            return (
              <li
                key={item.id}
                className={`flex items-start gap-4 px-6 py-5 ${
                  i === ITEMS.length - 1 ? "" : "border-b border-[#EEF1F4]"
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${style.bg}`}
                >
                  <IconCmp
                    className={`h-5 w-5 ${style.color}`}
                    strokeWidth={2.2}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold text-[#0F172A]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-[20px] text-[#64748B]">
                    {item.body}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                  {item.time}
                </span>
              </li>
            );
          })}
        </ul>
      </motion.section>
    </div>
  );
}
