"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

interface NotifPrefs {
  newInquiry: boolean;
  newReview: boolean;
  dailyReport: boolean;
}

export default function ServiceParametersPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [prefs, setPrefs] = useState<NotifPrefs>({
    newInquiry: true,
    newReview: true,
    dailyReport: true,
  });

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
        const parts = (data.display_name ?? "").split(" ");
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
        setPhone(data.phone ?? "");
        setEmail(user!.email ?? "");
      }
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(`mb-whatsapp-${user!.id}`)
          : null;
      if (saved) setWhatsapp(saved);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: [firstName, lastName].filter(Boolean).join(" "),
        phone,
      })
      .eq("id", user.id);
    setSaving(false);
    if (!error) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`mb-whatsapp-${user.id}`, whatsapp);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  function Toggle({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
  }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ backgroundColor: checked ? "#2563EB" : "#E2E8F0" }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
          style={{
            transform: checked ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </button>
    );
  }

  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          პროფილის პარამეტრები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მართეთ თქვენი პროფილი და შეტყობინებების პარამეტრები.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="relative flex items-center gap-4 bg-gradient-to-r from-[#2563EB] to-[#1E40AF] px-6 py-6 text-white">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-[20px] font-black text-[#2563EB] shadow-lg">
            {initials || "S"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-black">
              {[firstName, lastName].filter(Boolean).join(" ") ||
                "მომხმარებელი"}
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-white/80">
              სერვისის პროვაიდერი
            </p>
          </div>
          {profile?.rating != null && (
            <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-bold">
              <Star className="h-3.5 w-3.5" fill="currentColor" />
              {Number(profile.rating).toFixed(1)}
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onSubmit={handleSave}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            პირადი დეტალები
          </h2>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                სახელი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                გვარი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                პირადი ნომერი
              </label>
              <input
                type="text"
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                placeholder="01008060403"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                ტელეფონის ნომერი
              </label>
              {loading ? (
                <Skeleton className="h-11 rounded-xl" />
              ) : (
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+995 5XX XX XX XX"
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                />
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                ელ.ფოსტა
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-semibold text-[#94A3B8]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                WhatsApp ნომერი
              </label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+995 5XX XX XX XX"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)] hover:bg-[#1E293B] disabled:opacity-60"
          >
            {saved && <Check className="h-4 w-4" />}
            {saving
              ? "შენახვა..."
              : saved
                ? "შენახულია"
                : "ცვლილებების შენახვა"}
          </button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
        >
          <h2 className="text-[15px] font-black text-[#0F172A]">
            შეტყობინებების მართვა
          </h2>

          <div className="mt-5 space-y-3">
            {[
              {
                key: "newInquiry" as const,
                title: "ახალი მოთხოვნა",
                sub: "ვებ-შეტყობინება და SMS",
              },
              {
                key: "newReview" as const,
                title: "ახალი შეფასება",
                sub: "მხოლოდ ვებ-შეტყობინება",
              },
              {
                key: "dailyReport" as const,
                title: "ყოველდღიური რეპორტი",
                sub: "მხოლოდ ელ-ფოსტა",
              },
            ].map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between rounded-xl border border-[#EEF1F4] bg-white px-4 py-3.5"
              >
                <div>
                  <p className="text-[13px] font-black text-[#0F172A]">
                    {row.title}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                    {row.sub}
                  </p>
                </div>
                <Toggle
                  checked={prefs[row.key]}
                  onChange={(v) => setPrefs((p) => ({ ...p, [row.key]: v }))}
                />
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
