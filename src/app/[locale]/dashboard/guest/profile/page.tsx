"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Camera, Check, Mail, Phone, Save, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import type { Tables } from "@/lib/types/database";
import {
  contentChangeErrorKey,
  submitContentChange,
} from "@/lib/content-change/client";

export default function GuestProfilePage() {
  const t = useTranslations("GuestProfile");
  const tShared = useTranslations("CreateShared");
  const { user } = useAuth();
  const supabase = createClient();

  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reviewError, setReviewError] = useState("");

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
        setPhone(toLocalGePhone(data.phone));
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
    setPhone(toLocalGePhone(profile.phone));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (phone && !isValidGePhone(phone)) return;
    setSaving(true);
    setSaved(false);
    setReviewError("");
    let error: Error | null = null;
    try {
      await submitContentChange("profile", user.id, {
        display_name: [firstName, lastName].filter(Boolean).join(" "),
        phone: phone ? "+995" + phone : null,
      });
    } catch (cause) {
      error = cause instanceof Error ? cause : new Error("submit_failed");
    }
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setReviewError(tShared(contentChangeErrorKey(error)));
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t("errors.fileTooLarge"));
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError(t("errors.invalidFormat"));
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = pub.publicUrl;

      await submitContentChange("profile", user.id, { avatar_url: newUrl });

      setAvatarUrl(newUrl);
    } catch {
      setUploadError(t("errors.uploadFailed"));
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
      .toUpperCase() || t("defaultInitial");

  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
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
              aria-label={t("uploadPhoto")}
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
              {t("avatarTitle")}
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              {t("avatarHint")}
            </p>
            {uploadingAvatar && (
              <p className="mt-2 text-[12px] font-medium text-[#0F8F60]">
                {tShared("loading")}
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
              label={t("firstName")}
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
              label={t("lastName")}
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
              label={t("phone")}
              icon={<Phone className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
              error={
                phone && !isValidGePhone(phone) ? tShared("invalidPhone") : null
              }
            >
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))
                }
                placeholder="599 12 34 56"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#0F8F60] focus:outline-none focus:ring-2 focus:ring-[#0F8F60]/10"
              />
            </ProfileField>

            <ProfileField
              label={t("email")}
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
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || (!!phone && !isValidGePhone(phone))}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F8F60] px-6 py-3 text-[13px] font-bold text-white shadow-[0_6px_14px_-4px_rgba(15,143,96,0.35)] transition-colors hover:bg-[#0B7A52] disabled:opacity-60"
            >
              {saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? t("saving") : saved ? t("saved") : t("saveChanges")}
            </button>
          </div>
          {saved && (
            <p className="mt-3 text-[13px] font-medium text-[#0F8F60]">
              {tShared("contentChange.pending")}
            </p>
          )}
          {reviewError && (
            <p className="mt-3 text-[13px] font-medium text-[#DC2626]">
              {reviewError}
            </p>
          )}
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
  error,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
        {label}
      </label>
      {loading ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : (
        <>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
              {icon}
            </span>
            {children}
          </div>
          {error && <p className="mt-1 text-xs text-[#EF4444]">{error}</p>}
        </>
      )}
    </div>
  );
}
