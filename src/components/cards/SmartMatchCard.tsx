"use client";

import { motion } from "framer-motion";

interface RequestItem {
  title: string;
  details: string;
  actionType: "offer" | "verify";
}

const mockRequests: RequestItem[] = [
  {
    title: "2 ოთახიანი • დიდველი",
    details: "15-18 თებ • 4 სტუმარი • ბიუჯეტი: 100₾",
    actionType: "offer",
  },
  {
    title: "კოტეჯი • პარკთან",
    details: "20-22 თებ • 8 სტუმარი • Pet Friendly",
    actionType: "verify",
  },
  {
    title: "სტუდიო • ცენტრი",
    details: "10-12 თებ • 2 სტუმარი • ბიუჯეტი: 60₾",
    actionType: "offer",
  },
];

interface SmartMatchCardProps {
  notificationCount: number;
  onClick: () => void;
}

export default function SmartMatchCard({
  notificationCount,
  onClick,
}: SmartMatchCardProps) {
  const visibleRequests = mockRequests.slice(0, Math.max(notificationCount, 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full overflow-hidden rounded-[24px] border-none bg-gradient-to-br from-[#0F204C] to-[#1E3A8A] p-6 text-left text-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 size-[192px] rounded-full bg-[rgba(59,130,246,0.2)] blur-[32px]" />

      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-[4px] border border-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.225px] text-white">
              SMART MATCH
            </span>
            <span className="text-[10px] font-medium text-[#BFDBFE]">
              სტუმრების მოთხოვნები
            </span>
          </div>
          <h3 className="mt-6 text-[30px] font-black leading-[38px]">
            ნახე რას ეძებენ ახლა
          </h3>
        </div>
        {notificationCount > 0 && (
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-accent">
            {notificationCount}
            <span className="absolute inset-0 animate-ping rounded-full bg-white/40" />
          </span>
        )}
      </button>

      {visibleRequests.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          {visibleRequests.map((request, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/10 p-[17px] backdrop-blur-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold leading-[21px] text-white">
                  {request.title}
                </p>
                <p className="mt-0.5 text-[11px] font-normal leading-[16px] text-[#BFDBFE]">
                  {request.details}
                </p>
              </div>
              {request.actionType === "offer" ? (
                <button className="shrink-0 rounded-[8px] bg-[#F97316] px-4 py-2 text-[10px] font-black uppercase tracking-[0.25px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#EA680C]">
                  OFFER
                </button>
              ) : (
                <button className="shrink-0 rounded-[8px] border border-white/20 px-3 py-2 text-[10px] font-black uppercase text-white/80 transition-colors hover:bg-white/5">
                  VERIFY FIRST
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {visibleRequests.length > 0 && (
        <p className="mt-4 text-[11px] leading-relaxed text-white/40">
          მესაკუთრეების კაბინეტში შეგიძლიათ იხილოთ შეუსრულებელი მოთხოვნები.
        </p>
      )}
    </motion.div>
  );
}
