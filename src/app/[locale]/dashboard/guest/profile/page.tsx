"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, LogOut, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/types/database";

export default function GuestProfilePage() {
  const { user, signOut } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!user) return;
    async function fetchProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (data) {
        setProfile(data);
        const parts = (data.display_name ?? "").split(" ");
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
        setPhone(data.phone ?? "");
        setEmail(user!.email ?? "");
      }
      setLoading(false);
    }
    fetchProfile();
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
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
          განაახლე სახელი, საკონტაქტო ინფორმაცია და სხვა დეტალები.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)]"
      >
        <div className="relative flex items-center gap-4 bg-gradient-to-r from-[#0F8F60] to-[#0B7A52] px-6 py-6 text-white">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-[20px] font-black text-[#0F8F60] shadow-lg">
            {initials || "S"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-black">
              {[firstName, lastName].filter(Boolean).join(" ") || "სტუმარი"}
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-[12px] font-medium text-white/80">
              <span>{user?.email ?? "—"}</span>
            </p>
          </div>
          {profile?.rating != null && (
            <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-bold">
              <Star className="h-3.5 w-3.5" fill="currentColor" />
              {Number(profile.rating).toFixed(1)}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSave}
          className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2"
        >
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
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
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
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            )}
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
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            )}
          </div>

          <div>
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

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end md:col-span-2">
            <button
              type="button"
              onClick={() => signOut?.()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-5 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:border-[#EF4444] hover:text-[#EF4444]"
            >
              <LogOut className="h-4 w-4" />
              გამოსვლა
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F8F60] px-6 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52] disabled:opacity-60"
            >
              {saved && <Check className="h-4 w-4" />}
              {saving
                ? "შენახვა..."
                : saved
                  ? "შენახულია"
                  : "ცვლილებების შენახვა"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
