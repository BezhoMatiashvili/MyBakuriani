"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Check, Mail, Phone, Save, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Tables } from "@/lib/types/database";

export default function GuestProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    }
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function resetForm() {
    if (!profile) return;
    const parts = (profile.display_name ?? "").split(" ");
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setPhone(profile.phone ?? "");
    setSaved(false);
  }

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

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setUploadError("ფაილი არ უნდა აღემატებოდეს 2MB-ს");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError("მხოლოდ JPG და PNG ფორმატია დაშვებული");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = pub.publicUrl;

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", user.id);
      if (dbErr) throw dbErr;

      setAvatarUrl(newUrl);
    } catch {
      setUploadError("ფოტოს ატვირთვა ვერ მოხერხდა");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials =
    [firstName, lastName]
      .filter(Boolean)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "ს";

  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          პროფილის პარამეტრები
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          მართეთ თქვენი პერსონალური მონაცემები და საკონტაქტო ინფორმაცია.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-8"
      >
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Avatar className="h-24 w-24 border-2 border-[#DCFCE7]">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="avatar" />}
              <AvatarFallback className="bg-[#DCFCE7] text-[26px] font-black text-[#0F8F60]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="ატვირთე ფოტო"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[#0F8F60] shadow-sm transition-colors hover:border-[#0F8F60] hover:bg-[#ECFDF5] disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-black text-[#0F172A]">
              პროფილის ფოტო
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              ატვირთეთ ფოტო (JPG, PNG). მაქს. ზომა 2MB.
            </p>
            {uploadingAvatar && (
              <p className="mt-2 text-[12px] font-medium text-[#0F8F60]">
                იტვირთება...
              </p>
            )}
            {uploadError && (
              <p className="mt-2 text-[12px] font-medium text-[#EF4444]">
                {uploadError}
              </p>
            )}
          </div>
        </div>

        <div className="my-6 h-px bg-[#EEF1F4]" />

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <ProfileField
              label="სახელი"
              icon={<User className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            </ProfileField>

            <ProfileField
              label="გვარი"
              icon={<User className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            </ProfileField>

            <ProfileField
              label="ტელეფონის ნომერი"
              icon={<Phone className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="599 12 34 56"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            </ProfileField>

            <ProfileField
              label="ელ. ფოსტა (Gmail)"
              icon={<Mail className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="email"
                value={email}
                disabled
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#94A3B8]"
              />
            </ProfileField>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-6 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A]"
            >
              გაუქმება
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F8F60] px-6 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52] disabled:opacity-60"
            >
              {saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
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

function ProfileField({
  label,
  icon,
  loading,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
        {label}
      </label>
      {loading ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
            {icon}
          </span>
          {children}
        </div>
      )}
    </div>
  );
}
