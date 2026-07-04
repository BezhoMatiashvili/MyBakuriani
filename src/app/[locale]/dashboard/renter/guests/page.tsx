"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { List, Ban, Pencil, UserPlus, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import GuestFormModal from "@/components/renter/GuestFormModal";
import GuestHistoryPanel, {
  type VisitHistory,
} from "@/components/renter/GuestHistoryPanel";
import { parseISODate } from "@/components/shared/DateField";
import { formatDate, formatDateRange } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type Guest = Tables<"renter_guests">;

type Tab = "all" | "blacklist";

// Booking rows fetched once to assemble each guest's stay history. Embeds are
// cast (PostgREST types to-one relations loosely), matching the calendar page.
interface ManualStayRow {
  id: string;
  renter_guest_id: string | null;
  check_in: string;
  check_out: string;
  amount: number | null;
  status: string | null;
  property: { title: string | null } | null;
}

interface PlatformStayRow {
  id: string;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  status: string | null;
  property: { title: string | null } | null;
}

/**
 * Render a stored visit_dates value. New records store "checkIn/checkOut" ISO;
 * legacy records may hold a single ISO date or free text. Dates are parsed via
 * parseISODate (not new Date) to avoid the UTC off-by-one in Georgia (UTC+4).
 */
function formatVisit(raw: string | null, locale: string): string {
  const isISO = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const [a, b] = (raw ?? "").split("/");
  if (isISO(a) && isISO(b))
    return formatDateRange(parseISODate(a)!, parseISODate(b)!, locale);
  if (isISO(a)) return formatDate(parseISODate(a), locale);
  return raw || "—";
}

export default function RenterGuestsPage() {
  const t = useTranslations("RenterGuests");
  const tShared = useTranslations("DashboardShared");
  const { user } = useAuth();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("all");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [manualStays, setManualStays] = useState<ManualStayRow[]>([]);
  const [platformStays, setPlatformStays] = useState<PlatformStayRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Stay history: the renter's manual + platform bookings, fetched once. These
  // never change on a blacklist/edit, so they live in their own effect.
  const fetchStays = useCallback(async () => {
    if (!user) return;
    const [manualRes, platformRes] = await Promise.all([
      supabase
        .from("manual_bookings")
        .select(
          "id, renter_guest_id, check_in, check_out, amount, status, property:properties!manual_bookings_property_id_fkey(title)",
        )
        .eq("owner_id", user.id)
        .order("check_in", { ascending: false })
        .limit(500),
      supabase
        .from("bookings")
        .select(
          "id, guest_id, check_in, check_out, total_price, status, property:properties!bookings_property_id_fkey(title)",
        )
        .eq("owner_id", user.id)
        .order("check_in", { ascending: false })
        .limit(500),
    ]);
    setManualStays((manualRes.data ?? []) as unknown as ManualStayRow[]);
    setPlatformStays((platformRes.data ?? []) as unknown as PlatformStayRow[]);
  }, [supabase, user]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  useEffect(() => {
    fetchStays();
  }, [fetchStays]);

  // Group stays under each guest via the stored FKs (no phone matching here):
  // manual bookings by renter_guest_id, platform bookings by guest_id -> the
  // guest whose profile_id matches. Each list sorted newest-first.
  const historyByGuest = useMemo(() => {
    const map = new Map<string, VisitHistory[]>();
    const push = (gid: string, v: VisitHistory) => {
      const arr = map.get(gid);
      if (arr) arr.push(v);
      else map.set(gid, [v]);
    };

    for (const m of manualStays) {
      if (!m.renter_guest_id) continue;
      push(m.renter_guest_id, {
        id: m.id,
        source: "manual",
        propertyTitle: m.property?.title ?? null,
        checkIn: m.check_in,
        checkOut: m.check_out,
        amount: m.amount,
        status: m.status,
      });
    }

    const profileToGuest = new Map<string, string>();
    for (const g of guests) {
      if (g.profile_id) profileToGuest.set(g.profile_id, g.id);
    }
    for (const p of platformStays) {
      const gid = p.guest_id ? profileToGuest.get(p.guest_id) : undefined;
      if (!gid) continue;
      push(gid, {
        id: p.id,
        source: "platform",
        propertyTitle: p.property?.title ?? null,
        checkIn: p.check_in,
        checkOut: p.check_out,
        amount: p.total_price,
        status: p.status,
      });
    }

    for (const arr of map.values()) {
      arr.sort((a, b) =>
        a.checkIn < b.checkIn ? 1 : a.checkIn > b.checkIn ? -1 : 0,
      );
    }
    return map;
  }, [manualStays, platformStays, guests]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                  stays={historyByGuest.get(g.id) ?? []}
                  isOpen={expanded.has(g.id)}
                  isLast={i === visibleGuests.length - 1}
                  onToggle={() => toggle(g.id)}
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
  stays,
  isOpen,
  isLast,
  onToggle,
  onEdit,
  onBlacklist,
  onRestore,
}: {
  guest: Guest;
  stays: VisitHistory[];
  isOpen: boolean;
  isLast: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onBlacklist: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations("RenterGuests");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();
  const panelId = `guest-history-${guest.id}`;

  return (
    <div className={isLast ? "" : "border-b border-[#EEF1F4]"}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="grid cursor-pointer grid-cols-1 gap-2 px-4 py-4 transition-colors hover:bg-[#F8FAFC] sm:grid-cols-[1.6fr_1fr_2fr_auto] sm:items-center sm:gap-4 sm:px-6 sm:py-5"
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
            {formatVisit(guest.visit_dates, locale)}
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
            guest.blacklisted
              ? "font-extrabold text-[#DC2626]"
              : "text-[#475569]"
          }`}
        >
          {guest.note || "—"}
        </p>
        <div className="flex items-center justify-end gap-2">
          {!guest.blacklisted ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3E8FF] text-[#9333EA] transition-colors hover:bg-[#E9D5FF] sm:h-8 sm:w-8"
                aria-label={tShared("edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBlacklist();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FEE2E2] text-[#DC2626] transition-colors hover:bg-[#FECACA] sm:h-8 sm:w-8"
                aria-label={t("block")}
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              className="text-[12px] font-bold text-[#64748B] hover:text-[#2563EB] hover:underline"
            >
              {t("restore")}
            </button>
          )}
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-[#94A3B8] transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <GuestHistoryPanel guest={guest} stays={stays} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
