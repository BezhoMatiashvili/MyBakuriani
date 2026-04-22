"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { List, Ban, Pencil } from "lucide-react";

interface Guest {
  id: string;
  name: string;
  phone: string;
  dates: string;
  tag: { label: string; tone: "success" | "blacklist" };
  note: string;
  noteTone: "default" | "danger";
  blacklisted: boolean;
}

// TODO: wire to real guests table — mock data matches Figma reference.
const MOCK_GUESTS: Guest[] = [
  {
    id: "1",
    name: "ნინო მახარაძე",
    phone: "599 12 34 56",
    dates: "10-12 თებ.",
    tag: { label: "ხელით", tone: "success" },
    note: "მშვიდი, სუფთა სტუმარია.",
    noteTone: "default",
    blacklisted: false,
  },
  {
    id: "2",
    name: "დავით გ.",
    phone: "555 99 88 77",
    dates: "15 იან.",
    tag: { label: "BLACKLIST", tone: "blacklist" },
    note: "არ გამოცხადდა.",
    noteTone: "danger",
    blacklisted: true,
  },
];

type Tab = "all" | "blacklist";

export default function RenterGuestsPage() {
  const [tab, setTab] = useState<Tab>("all");

  const guests = MOCK_GUESTS.filter((g) =>
    tab === "all" ? true : g.blacklisted,
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          სტუმრების ბაზა
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          თქვენი ლოიალური კლიენტები და შავი სია.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_1px_3px_rgba(0,0,0,0.04)]"
      >
        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-[#EEF1F4] px-6 pt-4">
          <TabButton
            active={tab === "all"}
            onClick={() => setTab("all")}
            icon={<List className="h-4 w-4" />}
            label="ყველა"
            tone="primary"
          />
          <TabButton
            active={tab === "blacklist"}
            onClick={() => setTab("blacklist")}
            icon={<Ban className="h-4 w-4" />}
            label="შავი სია"
            tone="danger"
          />
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1.6fr_1fr_2fr_auto] gap-4 px-6 py-4 text-[12px] font-semibold text-[#94A3B8]">
          <span>სტუმარი</span>
          <span>ვიზიტი</span>
          <span>შენიშვნა</span>
          <span className="pl-6 text-right">მოქმედება</span>
        </div>

        {/* Rows */}
        <div>
          {guests.map((g, i) => (
            <GuestRow key={g.id} guest={g} isLast={i === guests.length - 1} />
          ))}
          {guests.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-[#94A3B8]">
              ჩანაწერები ვერ მოიძებნა
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "primary" | "danger";
}) {
  const activeColor = tone === "primary" ? "#2563EB" : "#DC2626";
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative pb-3 -mb-px"
      style={{ color: active ? activeColor : "#64748B" }}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold">
        {icon}
        {label}
      </span>
      {active && (
        <span
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
          style={{ backgroundColor: activeColor }}
        />
      )}
    </button>
  );
}

function GuestRow({ guest, isLast }: { guest: Guest; isLast: boolean }) {
  return (
    <div
      className={`grid grid-cols-[1.6fr_1fr_2fr_auto] items-center gap-4 px-6 py-5 ${
        isLast ? "" : "border-b border-[#EEF1F4]"
      }`}
    >
      <div>
        <p
          className={`text-[14px] font-extrabold ${
            guest.blacklisted ? "text-[#DC2626]" : "text-[#0F172A]"
          }`}
        >
          {guest.name}
        </p>
        <p className="mt-0.5 text-[12px] text-[#94A3B8]">{guest.phone}</p>
      </div>
      <div>
        <p className="text-[13px] font-extrabold text-[#0F172A]">
          {guest.dates}
        </p>
        <span
          className={`mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            guest.tag.tone === "blacklist"
              ? "bg-[#0F172A] text-white"
              : "bg-[#DCFCE7] text-[#16A34A]"
          }`}
        >
          {guest.tag.label}
        </span>
      </div>
      <p
        className={`text-[13px] ${
          guest.noteTone === "danger"
            ? "font-extrabold text-[#DC2626]"
            : "text-[#475569]"
        }`}
      >
        {guest.note}
      </p>
      <div className="flex items-center justify-end gap-2">
        {!guest.blacklisted ? (
          <>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F3E8FF] text-[#9333EA] transition-colors hover:bg-[#E9D5FF]"
              aria-label="რედაქტირება"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA]"
              aria-label="დაბლოკვა"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-[12px] font-bold text-[#64748B] hover:text-[#2563EB] hover:underline"
          >
            აღდგენა
          </button>
        )}
      </div>
    </div>
  );
}
