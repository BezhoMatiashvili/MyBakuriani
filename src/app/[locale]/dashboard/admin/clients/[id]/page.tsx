"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  Building2,
  Calendar,
  CreditCard,
  ShieldCheck,
  ShieldOff,
  Bell,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPhone, formatPrice } from "@/lib/utils/format";
import type { Tables, Enums } from "@/lib/types/database";

const roleLabels: Record<Enums<"user_role">, string> = {
  guest: "სტუმარი",
  renter: "დამქირავებელი",
  seller: "გამყიდველი",
  cleaner: "დამლაგებელი",
  food: "კვება",
  entertainment: "გართობა",
  transport: "ტრანსპორტი",
  employment: "დასაქმება",
  handyman: "ხელოსანი",
  admin: "ადმინი",
};

// This picker never offers "admin" — granting admin access is not a role
// change reachable from here (enforced again server-side in the role route).
const assignableRoleEntries = Object.entries(roleLabels).filter(
  ([value]) => value !== "admin",
) as [Enums<"user_role">, string][];

// manual_bookings.status has no "pending"/"confirmed"/"completed" — those are
// the retired public.bookings enum. See memory-bank/contracts.md C20/C25.
const manualBookingStatusLabels: Record<string, string> = {
  booked: "დაჯავშნილი",
  manual: "ხელით დამატებული",
  cancelled: "გაუქმებული",
};

export default function ClientDetailPage() {
  const t = useTranslations("AdminClientDetail");
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [bookings, setBookings] = useState<Tables<"manual_bookings">[]>([]);
  const [transactions, setTransactions] = useState<Tables<"transactions">[]>(
    [],
  );
  const [adminNote, setAdminNote] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [verifiedSubmitting, setVerifiedSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "properties" | "bookings" | "transactions"
  >("properties");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [detailRes, txRes] = await Promise.all([
          fetch(`/api/admin/clients/${userId}`, { cache: "no-store" }),
          fetch(`/api/admin/clients/${userId}/transactions`, {
            cache: "no-store",
          }),
        ]);
        if (cancelled) return;
        const detail = detailRes.ok
          ? ((await detailRes.json()) as {
              profile?: Tables<"profiles">;
              properties?: Tables<"properties">[];
              bookings?: Tables<"manual_bookings">[];
            })
          : null;
        const txPayload = txRes.ok
          ? ((await txRes.json()) as {
              transactions?: Tables<"transactions">[];
            })
          : null;
        if (cancelled) return;
        setProfile(detail?.profile ?? null);
        setProperties(detail?.properties ?? []);
        setBookings(detail?.bookings ?? []);
        setTransactions(txPayload?.transactions ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleRoleChange = async (newRole: Enums<"user_role">) => {
    setRoleSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clients/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(payload?.error ?? "role change failed");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, role: newRole } : prev));
    } finally {
      setRoleSubmitting(false);
    }
  };

  const handleVerifiedToggle = async () => {
    if (!profile) return;
    const newVerified = !profile.is_verified;
    setVerifiedSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clients/${userId}/verified`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_verified: newVerified }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(payload?.error ?? "update failed");
        return;
      }
      setProfile((prev) =>
        prev ? { ...prev, is_verified: newVerified } : prev,
      );
    } finally {
      setVerifiedSubmitting(false);
    }
  };

  const tabs = [
    { key: "properties" as const, label: t("tabProperties"), icon: Building2 },
    { key: "bookings" as const, label: t("tabBookings"), icon: Calendar },
    {
      key: "transactions" as const,
      label: t("tabTransactions"),
      icon: CreditCard,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-60 w-full rounded-lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-[#94A3B8]">{t("notFound")}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          უკან დაბრუნება
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToClients")}
      </button>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1E293B]">
                {profile.display_name}
              </h1>
              <p className="text-sm text-[#94A3B8]">
                {formatPhone(profile.phone)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={profile.is_verified ? "verified" : "pending"}
                />
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-0.5 text-xs font-medium text-[#94A3B8]">
                  {roleLabels[profile.role]}
                </span>
              </div>
            </div>
          </div>

          {/* Admin actions */}
          <div className="flex flex-wrap gap-2">
            <select
              value={profile.role}
              disabled={roleSubmitting}
              onChange={(e) =>
                handleRoleChange(e.target.value as Enums<"user_role">)
              }
              className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm focus:outline-none disabled:opacity-50"
            >
              {assignableRoleEntries.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifiedToggle}
              disabled={verifiedSubmitting}
              className={
                profile.is_verified
                  ? "border-amber-300 text-amber-600"
                  : "border-green-300 text-green-600"
              }
            >
              {profile.is_verified ? (
                <>
                  <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                  {t("removeVerification")}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  {t("markVerified")}
                </>
              )}
            </Button>
            <Button variant="outline" size="sm">
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              {t("notify")}
            </Button>
          </div>
        </div>

        {/* Profile details grid */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[#E2E8F0] pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[#94A3B8]">{t("registered")}</p>
            <p className="text-sm font-medium text-[#1E293B]">
              {formatDate(profile.created_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">{t("rating")}</p>
            <p className="text-sm font-medium text-[#1E293B]">
              {profile.rating ? `${profile.rating}/5` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">{t("listings")}</p>
            <p className="text-sm font-medium text-[#1E293B]">
              {properties.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">{t("bookings")}</p>
            <p className="text-sm font-medium text-[#1E293B]">
              {bookings.length}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Notes */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-4 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-[#94A3B8]" />
          <h3 className="text-sm font-semibold text-[#1E293B]">{t("notes")}</h3>
        </div>
        <textarea
          className="mt-2 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:border-brand-accent focus:outline-none"
          rows={2}
          placeholder={t("notesPlaceholder")}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
        />
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#E2E8F0]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-[#94A3B8] hover:text-[#1E293B]"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "properties" && (
          <div className="space-y-2">
            {properties.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                {t("noProperties")}
              </p>
            ) : (
              properties.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <div>
                    <p className="font-medium text-[#1E293B]">{p.title}</p>
                    <p className="text-xs text-[#94A3B8]">
                      {p.type} • {p.location} •{" "}
                      {p.price_per_night
                        ? `${formatPrice(p.price_per_night)} / ღამე`
                        : "—"}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      p.status === "active"
                        ? "active"
                        : p.status === "blocked"
                          ? "blocked"
                          : "pending"
                    }
                  />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="space-y-2">
            {bookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                {t("noBookings")}
              </p>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1E293B]">
                      {formatDate(b.check_in)} — {formatDate(b.check_out)}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {formatPrice(b.amount ?? 0)} •{" "}
                      {manualBookingStatusLabels[b.status] ?? b.status}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      b.status === "cancelled"
                        ? "blocked"
                        : b.status === "booked"
                          ? "active"
                          : "pending"
                    }
                  />
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-2">
            {transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#94A3B8]">
                {t("noTransactions")}
              </p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1E293B]">
                      {tx.type} — {tx.description ?? "—"}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {tx.amount >= 0 ? "+" : ""}
                    {formatPrice(tx.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
