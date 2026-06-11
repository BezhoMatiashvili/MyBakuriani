"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  IdCard,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Upload,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { watermarkFile } from "@/lib/utils/watermark";

type FormValues = {
  firstName: string;
  lastName: string;
  personalNumber: string;
  phone: string;
  whatsapp: string;
  address: string;
};

const EMPTY_FORM: FormValues = {
  firstName: "",
  lastName: "",
  personalNumber: "",
  phone: "",
  whatsapp: "",
  address: "",
};

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function CleanerParametersPage() {
  const t = useTranslations("CleanerParameters");
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [savedValues, setSavedValues] = useState<FormValues>(EMPTY_FORM);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [{ data: cleaner }, { data: profile }] = await Promise.all([
        supabase
          .from("cleaner_profiles")
          .select("*")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("display_name, avatar_url, phone")
          .eq("id", user!.id)
          .single(),
      ]);

      let values: FormValues;
      if (cleaner) {
        values = {
          firstName: cleaner.first_name ?? "",
          lastName: cleaner.last_name ?? "",
          personalNumber: cleaner.personal_number ?? "",
          phone: cleaner.phone ?? profile?.phone ?? "",
          whatsapp: cleaner.whatsapp ?? "",
          address: cleaner.address ?? "",
        };
      } else {
        const parts = (profile?.display_name ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        values = {
          ...EMPTY_FORM,
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
          phone: profile?.phone ?? "",
        };
      }
      setForm(values);
      setSavedValues(values);
      setAvatarUrl(profile?.avatar_url ?? null);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function setField(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(savedValues);
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase.from("cleaner_profiles").upsert({
      id: user.id,
      first_name: toNullable(form.firstName),
      last_name: toNullable(form.lastName),
      personal_number: toNullable(form.personalNumber),
      phone: toNullable(form.phone),
      whatsapp: toNullable(form.whatsapp),
      address: toNullable(form.address),
      updated_at: new Date().toISOString(),
    });

    let profileOk = true;
    const displayName = [form.firstName.trim(), form.lastName.trim()]
      .filter(Boolean)
      .join(" ");
    if (displayName) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);
      profileOk = !profileError;
    }

    setSaving(false);
    if (!error && profileOk) {
      setSavedValues(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t("errFileTooLarge"));
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setUploadError(t("errBadFormat"));
      return;
    }

    setUploadingAvatar(true);
    try {
      const watermarked = await watermarkFile(file);
      const ext = watermarked.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, watermarked, {
          upsert: true,
          contentType: watermarked.type,
        });
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
      setUploadError(t("errUploadFailed"));
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials =
    [form.firstName, form.lastName]
      .filter(Boolean)
      .map((s) => s[0])
      .join(".") || "—";

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
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.04)] sm:p-8"
      >
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
          <Avatar className="h-24 w-24 shrink-0 border-2 border-[#DBEAFE]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={t("photoTitle")} />}
            <AvatarFallback className="bg-[#EFF6FF] text-[24px] font-black text-[#2563EB]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-black text-[#0F172A]">
                {t("photoTitle")}
              </h2>
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-bold text-[#16A34A]">
                {t("recommended")}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-[#64748B]">
              {t("photoDesc")}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:border-[#CBD5E1] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploadingAvatar ? t("uploading") : t("uploadPhoto")}
            </button>
            {uploadError && (
              <p className="mt-2 text-[12px] font-medium text-[#EF4444]">
                {uploadError}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
        </div>

        <div className="my-6 h-px bg-[#EEF1F4]" />

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterField
              label={t("firstName")}
              icon={<User className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setField("firstName", e.target.value)}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>

            <ParameterField
              label={t("lastName")}
              icon={<User className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setField("lastName", e.target.value)}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>

            <ParameterField
              label={t("personalNumber")}
              icon={<IdCard className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                inputMode="numeric"
                value={form.personalNumber}
                onChange={(e) => setField("personalNumber", e.target.value)}
                placeholder="01011012345"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>

            <ParameterField
              label={t("phone")}
              icon={<Phone className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="599 12 34 56"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>

            <ParameterField
              label={t("whatsapp")}
              icon={<MessageCircle className="h-4 w-4 text-[#22C55E]" />}
              loading={loading}
            >
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setField("whatsapp", e.target.value)}
                placeholder="599 12 34 56"
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>

            <ParameterField
              label={t("address")}
              labelExtra={
                <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
                  {t("optional")}
                </span>
              }
              icon={<MapPin className="h-4 w-4 text-[#94A3B8]" />}
              loading={loading}
            >
              <input
                type="text"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder={t("addressPlaceholder")}
                className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-11 pr-4 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </ParameterField>
          </div>

          <div className="h-px bg-[#EEF1F4]" />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-6 py-3 text-[13px] font-bold text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A]"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
            >
              {saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? t("saving") : saved ? t("saved") : t("saveChanges")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ParameterField({
  label,
  labelExtra,
  icon,
  loading,
  children,
}: {
  label: string;
  labelExtra?: React.ReactNode;
  icon: React.ReactNode;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-2 text-[12px] font-bold text-[#475569]">
        {label}
        {labelExtra}
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
