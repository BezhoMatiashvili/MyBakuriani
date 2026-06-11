"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { List, Ban, Pencil, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import GuestFormModal from "@/components/renter/GuestFormModal";
import type { Tables } from "@/lib/types/database";

type Guest = Tables<"renter_guests">;

type Tab = "all" | "blacklist";

export default function RenterGuestsPage() {
  const t = useTranslations("RenterGuests");
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("all");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; guest: Guest | null }>({
    open: false,
    guest: null,
  });

  const fetchGuests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("renter_guests")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setGuests(data);
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const handleBlacklist = async (guest: Guest, blacklisted: boolean) => {
    await supabase
      .from("renter_guests")
      .update({ blacklisted })
      .eq("id", guest.id);
    await fetchGuests();
  };

  const visibleGuests = guests.filter((g) =>
    tab === "all" ? true : g.blacklisted,
  );

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
            {t("title")}
          </h1>
          <p className="mt-1 text-[14px] font-medium text-[#64748B]">
            {t("subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, guest: null })}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF]"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2.3} />
          {tShared("add")}
        </button>
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
            label={t("tabAll")}
            tone="primary"
          />
          <TabButton
            active={tab === "blacklist"}
            onClick={() => setTab("blacklist")}
            icon={<Ban className="h-4 w-4" />}
            label={t("tabBlacklist")}
            tone="danger"
          />
        </div>

        {/* Table header */}
        <div className="hidden grid-cols-[1.6fr_1fr_2fr_auto] gap-4 px-6 py-4 text-[12px] font-semibold text-[#94A3B8] sm:grid">
          <span>{t("colGuest")}</span>
          <span>{t("colVisit")}</span>
          <span>{t("colNote")}</span>
          <span className="pl-6 text-right">{t("colAction")}</span>
        </div>

        {/* Rows */}
        <div>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[1.6fr_1fr_2fr_auto] sm:items-center sm:gap-4 sm:px-6 sm:py-5"
              >
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-8 w-20 justify-self-end" />
              </div>
            ))
          ) : (
            <>
              {visibleGuests.map((g, i) => (
                <GuestRow
                  key={g.id}
                  guest={g}
                  isLast={i === visibleGuests.length - 1}
                  onEdit={() => setModal({ open: true, guest: g })}
                  onBlacklist={() => handleBlacklist(g, true)}
                  onRestore={() => handleBlacklist(g, false)}
                />
              ))}
              {visibleGuests.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-[#94A3B8]">
                  {t("notFound")}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      <GuestFormModal
        isOpen={modal.open}
        guest={modal.guest}
        onClose={() => setModal({ open: false, guest: null })}
        onSaved={fetchGuests}
      />
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

function GuestRow({
  guest,
  isLast,
  onEdit,
  onBlacklist,
  onRestore,
}: {
  guest: Guest;
  isLast: boolean;
  onEdit: () => void;
  onBlacklist: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations("RenterGuests");
  const tShared = useTranslations("DashboardShared");

  return (
    <div
      className={`grid grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-[1.6fr_1fr_2fr_auto] sm:items-center sm:gap-4 sm:px-6 sm:py-5 ${
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
        <p className="mt-0.5 text-[12px] text-[#94A3B8]">
          {guest.phone || "—"}
        </p>
      </div>
      <div>
        <p className="text-[13px] font-extrabold text-[#0F172A]">
          {guest.visit_dates || "—"}
        </p>
        <span
          className={`mt-1 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            guest.blacklisted
              ? "bg-[#0F172A] text-white"
              : "bg-[#DCFCE7] text-[#16A34A]"
          }`}
        >
          {guest.blacklisted ? "BLACKLIST" : t("badgeGuest")}
        </span>
      </div>
      <p
        className={`text-[13px] ${
          guest.blacklisted ? "font-extrabold text-[#DC2626]" : "text-[#475569]"
        }`}
      >
        {guest.note || "—"}
      </p>
      <div className="flex items-center justify-end gap-2">
        {!guest.blacklisted ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3E8FF] text-[#9333EA] transition-colors hover:bg-[#E9D5FF] sm:h-8 sm:w-8"
              aria-label={tShared("edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onBlacklist}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA] sm:h-8 sm:w-8"
              aria-label={t("block")}
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onRestore}
            className="text-[12px] font-bold text-[#64748B] hover:text-[#2563EB] hover:underline"
          >
            {t("restore")}
          </button>
        )}
      </div>
    </div>
  );
}
