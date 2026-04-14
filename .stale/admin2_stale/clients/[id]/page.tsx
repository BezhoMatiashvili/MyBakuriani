"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  User,
  Building2,
  Calendar,
  CreditCard,
  ShieldCheck,
  Ban,
  Bell,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
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

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [properties, setProperties] = useState<Tables<"properties">[]>([]);
  const [bookings, setBookings] = useState<Tables<"bookings">[]>([]);
  const [transactions, setTransactions] = useState<Tables<"transactions">[]>(
    [],
  );
  const [verifications, setVerifications] = useState<Tables<"verifications">[]>(
    [],
  );
  const [adminNote, setAdminNote] = useState("");
  const [activeTab, setActiveTab] = useState<
    "properties" | "bookings" | "transactions" | "verifications"
  >("properties");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [
        { data: profileData },
        { data: propsData },
        { data: bookingsData },
        { data: txData },
        { data: verifData },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase
          .from("properties")
          .select("*")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("*")
          .or(`guest_id.eq.${userId},owner_id.eq.${userId}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("verifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      setProfile(profileData);
      setProperties(propsData ?? []);
      setBookings(bookingsData ?? []);
      setTransactions(txData ?? []);
      setVerifications(verifData ?? []);
      setLoading(false);
    }
    load();
  }, [userId]);

  const handleRoleChange = async (newRole: Enums<"user_role">) => {
    const supabase = createClient();
    await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    setProfile((prev) => (prev ? { ...prev, role: newRole } : prev));
  };

  const handleBlockToggle = async () => {
    if (!profile) return;
    const supabase = createClient();
    const newVerified = !profile.is_verified;
    await supabase
      .from("profiles")
      .update({ is_verified: newVerified })
      .eq("id", userId);
    setProfile((prev) => (prev ? { ...prev, is_verified: newVerified } : prev));
  };

  const bookingStatusLabels: Record<Enums<"booking_status">, string> = {
    pending: "მოლოდინში",
    confirmed: "დადასტურებული",
    cancelled: "გაუქმებული",
    completed: "დასრულებული",
  };

  const verificationStatusMap: Record<
    string,
    "pending" | "verified" | "blocked"
  > = {
    pending: "pending",
    approved: "verified",
    rejected: "blocked",
  };

  const tabs = [
    { key: "properties" as const, label: "ქონება", icon: Building2 },
    { key: "bookings" as const, label: "ჯავშნები", icon: Calendar },
    { key: "transactions" as const, label: "ტრანზაქციები", icon: CreditCard },
    {
      key: "verifications" as const,
      label: "ვერიფიკაციები",
      icon: ShieldCheck,
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
        <p className="text-muted-foreground">მომხმარებელი ვერ მოიძებნა</p>
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
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        კლიენტებთან დაბრუნება
      </button>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-[var(--shadow-card)]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {profile.display_name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatPhone(profile.phone)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={profile.is_verified ? "verified" : "pending"}
                />
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {roleLabels[profile.role]}
                </span>
              </div>
            </div>
          </div>

          {/* Admin actions */}
          <div className="flex flex-wrap gap-2">
            <select
              value={profile.role}
              onChange={(e) =>
                handleRoleChange(e.target.value as Enums<"user_role">)
              }
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none"
            >
              {Object.entries(roleLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBlockToggle}
              className={
                profile.is_verified
                  ? "border-red-300 text-red-600"
                  : "border-green-300 text-green-600"
              }
            >
              {profile.is_verified ? (
                <>
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  დაბლოკვა
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  განბლოკვა
                </>
              )}
            </Button>
            <Button variant="outline" size="sm">
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              შეტყობინება
            </Button>
          </div>
        </div>

        {/* Profile details grid */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">რეგისტრაცია</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(profile.created_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">რეიტინგი</p>
            <p className="text-sm font-medium text-foreground">
              {profile.rating ? `${profile.rating}/5` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">განცხადებები</p>
            <p className="text-sm font-medium text-foreground">
              {properties.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ჯავშნები</p>
            <p className="text-sm font-medium text-foreground">
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
        className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">შენიშვნები</h3>
        </div>
        <textarea
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-accent focus:outline-none"
          rows={2}
          placeholder="ადმინის შენიშვნის დამატება..."
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
        />
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                ქონება არ მოიძებნა
              </p>
            ) : (
              properties.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                ჯავშნები არ მოიძებნა
              </p>
            ) : (
              bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(b.check_in)} — {formatDate(b.check_out)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(b.total_price)} •{" "}
                      {bookingStatusLabels[b.status]}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      b.status === "completed" || b.status === "confirmed"
                        ? "active"
                        : b.status === "cancelled"
                          ? "blocked"
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                ტრანზაქციები არ მოიძებნა
              </p>
            ) : (
              transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.type} — {t.description ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.created_at)}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {formatPrice(t.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "verifications" && (
          <div className="space-y-2">
            {verifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                ვერიფიკაციები არ მოიძებნა
              </p>
            ) : (
              verifications.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg bg-brand-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      ვერიფიკაციის მოთხოვნა
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(v.created_at)}
                      {v.admin_notes && ` • ${v.admin_notes}`}
                    </p>
                  </div>
                  <StatusBadge
                    status={verificationStatusMap[v.status] ?? "pending"}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
